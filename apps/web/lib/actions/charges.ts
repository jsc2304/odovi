"use server";
import { revalidatePath } from "next/cache";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { auditLog, chargeSessionTags, chargeSessions, places, tags } from "@odovi/db";
import { computeAutoChargeCost } from "@odovi/core";
import { db } from "../db";
import { validateSession } from "../auth/session";
// Free-text-created tags get a color from the shared preset palette, cycled
// by current tag count so successive new tags get visibly different colors.
import { TAG_COLOR_PRESETS as TAG_COLOR_PALETTE } from "../tagColors";

/**
 * Parses a decimal amount accepting either a comma or dot separator (German
 * keyboard input, e.g. "12,50"). Returns null for empty input.
 */
function parseDecimalInput(raw: FormDataEntryValue | null): string | null | undefined {
  if (raw == null) return undefined;
  const str = String(raw).trim();
  if (str === "") return null;
  const normalized = str.replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return undefined; // invalid marker
  return normalized;
}

function nullableString(value: FormDataEntryValue | null): string | null {
  if (value == null) return null;
  const str = String(value).trim();
  return str === "" ? null : str;
}

export interface UpdateChargeAnnotationsResult {
  ok: boolean;
  error?: string;
  annotations?: { cost: string | null; currency: string | null; notes: string | null };
}

const ANNOTATION_FIELD_LABELS: Record<string, string> = {
  cost: "cost",
  currency: "currency",
  notes: "notes",
  costSource: "cost_source",
};

/**
 * Updates a charge session's post-processing annotations (Kosten, Währung,
 * Notizen). Zod-validated. Writes only fields that actually changed and
 * records one audit_log row per changed field. Requires an authenticated
 * session.
 */
export async function updateChargeAnnotations(
  _prev: UpdateChargeAnnotationsResult,
  formData: FormData,
): Promise<UpdateChargeAnnotationsResult> {
  const t = await getTranslations("charges");
  const user = await validateSession();
  if (!user) return { ok: false, error: t("errors.notLoggedIn") };

  const rawCost = parseDecimalInput(formData.get("cost"));
  if (rawCost === undefined && formData.get("cost") != null && String(formData.get("cost")).trim() !== "") {
    return { ok: false, error: t("errors.invalidAmount") };
  }

  const raw = {
    chargeSessionId: Number(formData.get("chargeSessionId")),
    cost: rawCost ?? null,
    currency: nullableString(formData.get("currency")),
    notes: nullableString(formData.get("notes")),
  };

  // Locale-abhängige Fehlermeldungen: Schema pro Request bauen statt als
  // Modul-Konstante, damit z.regex()-Messages in der aktiven Sprache sind.
  const annotationsSchema = z
    .object({
      chargeSessionId: z.number().int().positive(),
      cost: z
        .string()
        .regex(/^\d+(\.\d{1,2})?$/, t("errors.invalidAmount"))
        .nullable(),
      currency: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z]{3}$/, t("errors.currencyFormat"))
        .nullable(),
      notes: z.string().trim().max(5000).nullable(),
    })
    .refine((v) => v.cost == null || v.currency != null, {
      message: t("errors.currencyRequired"),
      path: ["currency"],
    });

  const parsed = annotationsSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? t("errors.invalidInput"),
    };
  }
  const input = parsed.data;

  const result = await db.transaction(async (tx) => {
  const rows = await tx
    .select({
      cost: chargeSessions.cost,
      currency: chargeSessions.currency,
      notes: chargeSessions.notes,
      costSource: chargeSessions.costSource,
      energyAddedKwh: chargeSessions.energyAddedKwh,
      pricePerKwh: places.electricityPricePerKwh,
      priceCurrency: places.electricityPriceCurrency,
    })
    .from(chargeSessions)
    .leftJoin(places, eq(chargeSessions.placeId, places.id))
    .where(eq(chargeSessions.id, input.chargeSessionId))
    .limit(1).for("update", { of: chargeSessions });
  const current = rows[0];
  if (!current) return { ok: false, error: t("errors.sessionNotFound") };

  const changes: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];
  const patch: Record<string, unknown> = {};

  // cost is stored as numeric -> comes back as string; compare normalized values
  const currentCost = current.cost != null ? String(Number(current.cost).toFixed(2)) : null;
  let nextCost = input.cost != null ? Number(input.cost).toFixed(2) : null;
  let nextCurrency = input.currency;
  let nextCostSource = current.costSource;
  if (input.cost == null) {
    // Empty means release the override, regardless of the currency selector.
    // Recompute here so saving also repairs previously stuck manual sessions.
    nextCurrency = null;
    nextCostSource = null;
    if (current.energyAddedKwh != null && current.pricePerKwh != null && current.priceCurrency != null) {
      nextCost = computeAutoChargeCost(current.energyAddedKwh, Number(current.pricePerKwh)).toFixed(2);
      nextCurrency = current.priceCurrency;
      nextCostSource = "auto";
    }
  } else if (currentCost !== nextCost || current.currency !== nextCurrency) {
    nextCostSource = "manual";
  }
  const annotations = { cost: nextCost, currency: nextCurrency, notes: input.notes };
  if (currentCost !== nextCost) {
    changes.push({ field: "cost", oldValue: currentCost, newValue: nextCost });
    patch.cost = nextCost;
  }
  if (current.currency !== nextCurrency) {
    changes.push({ field: "currency", oldValue: current.currency, newValue: nextCurrency });
    patch.currency = nextCurrency;
  }
  if (current.costSource !== nextCostSource) {
    changes.push({ field: "costSource", oldValue: current.costSource, newValue: nextCostSource });
    patch.costSource = nextCostSource;
  }
  if (current.notes !== input.notes) {
    changes.push({ field: "notes", oldValue: current.notes, newValue: input.notes });
    patch.notes = input.notes;
  }

  if (changes.length === 0) return { ok: true, annotations };

    await tx
      .update(chargeSessions)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(chargeSessions.id, input.chargeSessionId));

    await tx.insert(auditLog).values(
      changes.map((c) => ({
        entityType: "charge_session",
        entityId: input.chargeSessionId,
        field: ANNOTATION_FIELD_LABELS[c.field] ?? c.field,
        oldValue: c.oldValue,
        newValue: c.newValue,
        changedBy: user.username,
      })),
    );
  return { ok: true, annotations };
  });

  revalidatePath(`/charges/${input.chargeSessionId}`);
  revalidatePath("/charges");
  revalidatePath("/day/[date]", "page");

  return result;
}

/** Comma-joined, sorted tag names for a charge session — used as audit_log old/new value. */
async function chargeTagNames(chargeSessionId: number): Promise<string> {
  const rows = await db
    .select({ name: tags.name })
    .from(chargeSessionTags)
    .innerJoin(tags, eq(chargeSessionTags.tagId, tags.id))
    .where(eq(chargeSessionTags.chargeSessionId, chargeSessionId))
    .orderBy(asc(tags.name));
  return rows.map((r) => r.name).join(", ");
}

const assignTagSchema = z.object({
  chargeSessionId: z.number().int().positive(),
  tagName: z.string().trim().min(1).max(100),
});

export interface AssignedTag {
  id: number;
  name: string;
  color: string | null;
}

/**
 * Assigns a tag to a charge session by name — creates the tag first if it
 * doesn't exist yet (free-text create-and-assign), picking a color from a
 * small preset palette. Records the resulting tag set change in audit_log.
 * Returns the assigned tag so the client can track it under its real id.
 */
export async function assignTagToCharge(
  chargeSessionId: number,
  tagName: string,
): Promise<AssignedTag> {
  const t = await getTranslations("charges");
  const user = await validateSession();
  if (!user) throw new Error(t("errors.notLoggedIn"));

  const parsed = assignTagSchema.parse({ chargeSessionId, tagName });

  const before = await chargeTagNames(parsed.chargeSessionId);

  const assigned = await db.transaction(async (tx) => {
    let tagRow = (
      await tx
        .select({ id: tags.id, name: tags.name, color: tags.color })
        .from(tags)
        .where(eq(tags.name, parsed.tagName))
        .limit(1)
    )[0];

    if (!tagRow) {
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(tags);
      const color = TAG_COLOR_PALETTE[count % TAG_COLOR_PALETTE.length];
      const inserted = await tx
        .insert(tags)
        .values({ name: parsed.tagName, color })
        .onConflictDoNothing({ target: tags.name })
        .returning({ id: tags.id, name: tags.name, color: tags.color });
      tagRow = inserted[0];
      if (!tagRow) {
        // Lost a race with a concurrent create — re-select.
        tagRow = (
          await tx
            .select({ id: tags.id, name: tags.name, color: tags.color })
            .from(tags)
            .where(eq(tags.name, parsed.tagName))
            .limit(1)
        )[0];
      }
    }
    if (!tagRow) throw new Error(t("errors.tagCreateFailed"));

    await tx
      .insert(chargeSessionTags)
      .values({ chargeSessionId: parsed.chargeSessionId, tagId: tagRow.id })
      .onConflictDoNothing();

    return tagRow;
  });

  const after = await chargeTagNames(parsed.chargeSessionId);
  if (after !== before) {
    await db.insert(auditLog).values({
      entityType: "charge_session",
      entityId: parsed.chargeSessionId,
      field: "tags",
      oldValue: before || null,
      newValue: after || null,
      changedBy: user.username,
    });
  }

  revalidatePath(`/charges/${parsed.chargeSessionId}`);
  revalidatePath("/charges");
  revalidatePath("/day/[date]", "page");

  return assigned;
}

const removeTagSchema = z.object({
  chargeSessionId: z.number().int().positive(),
  tagId: z.number().int().positive(),
});

/** Removes a tag assignment from a charge session and records the change in audit_log. */
export async function removeTagFromCharge(
  chargeSessionId: number,
  tagId: number,
): Promise<void> {
  const t = await getTranslations("charges");
  const user = await validateSession();
  if (!user) throw new Error(t("errors.notLoggedIn"));

  const parsed = removeTagSchema.parse({ chargeSessionId, tagId });

  const before = await chargeTagNames(parsed.chargeSessionId);

  await db
    .delete(chargeSessionTags)
    .where(
      and(
        eq(chargeSessionTags.chargeSessionId, parsed.chargeSessionId),
        eq(chargeSessionTags.tagId, parsed.tagId),
      ),
    );

  const after = await chargeTagNames(parsed.chargeSessionId);
  if (after !== before) {
    await db.insert(auditLog).values({
      entityType: "charge_session",
      entityId: parsed.chargeSessionId,
      field: "tags",
      oldValue: before || null,
      newValue: after || null,
      changedBy: user.username,
    });
  }

  revalidatePath(`/charges/${parsed.chargeSessionId}`);
  revalidatePath("/charges");
  revalidatePath("/day/[date]", "page");
}
