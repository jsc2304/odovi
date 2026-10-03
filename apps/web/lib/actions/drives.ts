"use server";
import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { auditLog, classificationOperations, driveTags, drives, places, sessions, tags } from "@odovi/db";
import { matchPlace } from "@odovi/core";
import { db } from "../db";
import { validateSession } from "../auth/session";
// Free-text-created tags get a color from the shared preset palette, cycled
// by current tag count so successive new tags get visibly different colors.
import { TAG_COLOR_PRESETS as TAG_COLOR_PALETTE } from "../tagColors";

const classificationSchema = z.enum([
  "unclassified",
  "private",
  "business",
  "commute",
]);

const inputSchema = z.object({
  driveId: z.number().int().positive(),
  classification: classificationSchema,
});

export interface ClassificationChange {
  operationId: number;
  classification: z.infer<typeof classificationSchema>;
  count: number;
  expiresAt: string;
  status: "available" | "expired" | "undone";
}

function operationSummary(operation: typeof classificationOperations.$inferSelect): ClassificationChange {
  return { operationId: operation.id, classification: operation.classification, count: operation.changes.length,
    expiresAt: operation.expiresAt.toISOString(),
    status: operation.undoneAt ? "undone" : operation.expiresAt.getTime() <= Date.now() ? "expired" : "available" };
}

function refreshClassificationViews(driveIds: number[]) {
  revalidatePath("/");
  revalidatePath("/search");
  revalidatePath("/day/[date]", "page");
  for (const id of driveIds) revalidatePath(`/drives/${id}`);
}

/** Restores the latest quick operation after navigation/reload in the same login session. */
export async function getLatestClassificationOperation(): Promise<ClassificationChange | null> {
  const user = await validateSession();
  if (!user) return null;
  const [operation] = await db.select().from(classificationOperations).where(and(
    eq(classificationOperations.sessionId, user.sessionId), eq(classificationOperations.userId, user.id),
  )).orderBy(desc(classificationOperations.id)).limit(1);
  return operation ? operationSummary(operation) : null;
}

/** Session lock orders overlapping operations; drive locks use a stable order. */
export async function bulkSetDriveClassification(
  driveIds: number[], classification: z.infer<typeof classificationSchema>,
): Promise<ClassificationChange | null> {
  const t = await getTranslations("drives");
  const user = await validateSession();
  if (!user) throw new Error(t("errors.notAuthenticated"));
  const parsed = z.object({ driveIds: z.array(z.number().int().positive()).min(1).max(1000), classification: classificationSchema }).parse({ driveIds, classification });
  const ids = [...new Set(parsed.driveIds)].sort((a, b) => a - b);
  const operation = await db.transaction(async (tx) => {
    const [session] = await tx.select().from(sessions).where(and(eq(sessions.id, user.sessionId), eq(sessions.userId, user.id))).for("update");
    if (!session || session.expiresAt.getTime() <= Date.now()) throw new Error(t("errors.notAuthenticated"));
    const rows = await tx.select().from(drives).where(inArray(drives.id, ids)).orderBy(asc(drives.id)).for("update");
    if (rows.length !== ids.length) throw new Error(t("errors.driveNotFound"));
    const changes: typeof classificationOperations.$inferInsert.changes = [];
    for (const row of rows) {
      if (row.classification === parsed.classification) continue;
      const [changed] = await tx.update(drives).set({ classification: parsed.classification, updatedAt: new Date() }).where(eq(drives.id, row.id))
        .returning({ revision: drives.classificationRevision });
      changes.push({ driveId: row.id, previous: row.classification, revision: changed!.revision });
      await tx.insert(auditLog).values({ entityType: "drive", entityId: row.id, field: "classification", oldValue: row.classification,
        newValue: parsed.classification, changedBy: user.username });
    }
    if (!changes.length) return null;
    // Bounded receipt retention; permanent annotation audit history is separate.
    await tx.delete(classificationOperations).where(lt(classificationOperations.expiresAt, new Date(Date.now() - 24 * 60 * 60 * 1000)));
    const [created] = await tx.insert(classificationOperations).values({ sessionId: user.sessionId, userId: user.id,
      classification: parsed.classification, changes, expiresAt: new Date(Date.now() + 30 * 60 * 1000) }).returning();
    return created!;
  });
  refreshClassificationViews(ids);
  return operation ? operationSummary(operation) : null;
}

export async function setDriveClassification(
  driveId: number, classification: z.infer<typeof classificationSchema>,
): Promise<ClassificationChange | null> {
  const parsed = inputSchema.parse({ driveId, classification });
  return bulkSetDriveClassification([parsed.driveId], parsed.classification);
}

/** Restore server-trusted membership atomically. Successful retries are no-ops. */
export type ClassificationUndoResult = { ok: true; operation: ClassificationChange } | { ok: false; error: string };

export async function undoDriveClassification(operationId: number): Promise<ClassificationUndoResult> {
  const t = await getTranslations("drives");
  const user = await validateSession();
  if (!user) return { ok: false, error: t("errors.notAuthenticated") };
  const parsedId = z.number().int().positive().safeParse(operationId);
  if (!parsedId.success) return { ok: false, error: t("undo.unavailable") };
  const id = parsedId.data;
  const result = await db.transaction(async (tx): Promise<ClassificationUndoResult> => {
    const [session] = await tx.select().from(sessions).where(and(eq(sessions.id, user.sessionId), eq(sessions.userId, user.id))).for("update");
    if (!session || session.expiresAt.getTime() <= Date.now()) return { ok: false, error: t("errors.notAuthenticated") };
    const [operation] = await tx.select().from(classificationOperations).where(and(eq(classificationOperations.id, id),
      eq(classificationOperations.sessionId, user.sessionId), eq(classificationOperations.userId, user.id))).for("update");
    if (!operation) return { ok: false, error: t("undo.unavailable") };
    if (operation.undoneAt) return { ok: true, operation: operationSummary(operation) };
    if (operation.expiresAt.getTime() <= Date.now()) return { ok: false, error: t("undo.expired") };
    const [latest] = await tx.select({ id: classificationOperations.id }).from(classificationOperations)
      .where(eq(classificationOperations.sessionId, user.sessionId)).orderBy(desc(classificationOperations.id)).limit(1);
    if (latest?.id !== id) return { ok: false, error: t("undo.superseded") };
    const ids = operation.changes.map(change => change.driveId).sort((a, b) => a - b);
    const rows = await tx.select().from(drives).where(inArray(drives.id, ids)).orderBy(asc(drives.id)).for("update");
    if (operation.expiresAt.getTime() <= Date.now()) return { ok: false, error: t("undo.expired") };
    const current = new Map(rows.map(row => [row.id, row]));
    if (operation.changes.some(change => current.get(change.driveId)?.classificationRevision !== change.revision ||
      current.get(change.driveId)?.classification !== operation.classification)) return { ok: false, error: t("undo.conflict") };
    for (const change of operation.changes) {
      await tx.update(drives).set({ classification: change.previous, updatedAt: new Date() }).where(eq(drives.id, change.driveId));
      await tx.insert(auditLog).values({ entityType: "drive", entityId: change.driveId, field: "classification",
        oldValue: operation.classification, newValue: change.previous, changedBy: user.username });
    }
    const [undone] = await tx.update(classificationOperations).set({ undoneAt: new Date() }).where(eq(classificationOperations.id, id)).returning();
    return { ok: true, operation: operationSummary(undone!) };
  });
  if (result.ok) {
    revalidatePath("/");
    revalidatePath("/search");
    revalidatePath("/day/[date]", "page");
    revalidatePath("/drives/[id]", "page");
  }
  return result;
}

const annotationsSchema = z.object({
  driveId: z.number().int().positive(),
  classification: classificationSchema,
  purpose: z.string().trim().max(500).nullable(),
  customer: z.string().trim().max(200).nullable(),
  project: z.string().trim().max(200).nullable(),
  notes: z.string().trim().max(5000).nullable(),
});

export interface UpdateAnnotationsResult {
  ok: boolean;
  error?: string;
  values?: { classification: string; purpose: string; customer: string; project: string; notes: string };
}

const ANNOTATION_FIELD_LABELS: Record<string, string> = {
  classification: "classification",
  purpose: "purpose",
  customer: "customer",
  project: "project",
  notes: "notes",
};

/**
 * Updates a drive's post-processing annotations (classification, Zweck,
 * Kunde, Projekt, Notizen). Zod-validated. Writes only fields that actually
 * changed and records one audit_log row per changed field. Requires an
 * authenticated session.
 */
export async function updateDriveAnnotations(
  _prev: UpdateAnnotationsResult,
  formData: FormData,
): Promise<UpdateAnnotationsResult> {
  const t = await getTranslations("drives");
  const user = await validateSession();
  if (!user) return { ok: false, error: t("errors.notAuthenticated") };

  const raw = {
    driveId: Number(formData.get("driveId")),
    classification: formData.get("classification"),
    purpose: nullableString(formData.get("purpose")),
    customer: nullableString(formData.get("customer")),
    project: nullableString(formData.get("project")),
    notes: nullableString(formData.get("notes")),
  };

  const parsed = annotationsSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? t("errors.invalidInput"),
    };
  }
  const input = parsed.data;

  const result = await db.transaction(async (tx): Promise<UpdateAnnotationsResult> => {
    const rows = await tx
      .select({
        classification: drives.classification,
        purpose: drives.purpose,
        customer: drives.customer,
        project: drives.project,
        notes: drives.notes,
      })
      .from(drives)
      .where(eq(drives.id, input.driveId))
      .limit(1).for("update");
    const current = rows[0];
    if (!current) return { ok: false, error: t("errors.driveNotFound") };

    const changes: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];
    const patch: Record<string, unknown> = {};

    if (current.classification !== input.classification) {
      changes.push({
        field: "classification",
        oldValue: current.classification,
        newValue: input.classification,
      });
      patch.classification = input.classification;
    }
    for (const field of ["purpose", "customer", "project", "notes"] as const) {
      if (current[field] !== input[field]) {
        changes.push({
          field: ANNOTATION_FIELD_LABELS[field],
          oldValue: current[field],
          newValue: input[field],
        });
        patch[field] = input[field];
      }
    }

    const values = { classification: input.classification, purpose: input.purpose ?? "", customer: input.customer ?? "", project: input.project ?? "", notes: input.notes ?? "" };
    if (changes.length === 0) return { ok: true, values };

    await tx
      .update(drives)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(drives.id, input.driveId));

    await tx.insert(auditLog).values(
      changes.map((c) => ({
        entityType: "drive",
        entityId: input.driveId,
        field: c.field,
        oldValue: c.oldValue,
        newValue: c.newValue,
        changedBy: user.username,
      })),
    );
    return { ok: true, values };
  });

  revalidatePath(`/drives/${input.driveId}`);
  revalidatePath("/day/[date]", "page");

  revalidatePath("/");
  return result;
}

function nullableString(value: FormDataEntryValue | null): string | null {
  if (value == null) return null;
  const str = String(value).trim();
  return str === "" ? null : str;
}

/** Comma-joined, sorted tag names for a drive — used as audit_log old/new value. */
async function driveTagNames(driveId: number): Promise<string> {
  const rows = await db
    .select({ name: tags.name })
    .from(driveTags)
    .innerJoin(tags, eq(driveTags.tagId, tags.id))
    .where(eq(driveTags.driveId, driveId))
    .orderBy(asc(tags.name));
  return rows.map((r) => r.name).join(", ");
}

const assignTagSchema = z.object({
  driveId: z.number().int().positive(),
  tagName: z.string().trim().min(1).max(100),
});

export interface AssignedTag {
  id: number;
  name: string;
  color: string | null;
}

/**
 * Assigns a tag to a drive by name — creates the tag first if it doesn't
 * exist yet (free-text create-and-assign), picking a color from a small
 * preset palette. Records the resulting tag set change in audit_log.
 * Returns the assigned tag so the client can track it under its real id.
 */
export async function assignTagToDrive(
  driveId: number,
  tagName: string,
): Promise<AssignedTag> {
  const t = await getTranslations("drives");
  const user = await validateSession();
  if (!user) throw new Error(t("errors.notAuthenticated"));

  const parsed = assignTagSchema.parse({ driveId, tagName });

  const before = await driveTagNames(parsed.driveId);

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
      .insert(driveTags)
      .values({ driveId: parsed.driveId, tagId: tagRow.id })
      .onConflictDoNothing();

    return tagRow;
  });

  const after = await driveTagNames(parsed.driveId);
  if (after !== before) {
    await db.insert(auditLog).values({
      entityType: "drive",
      entityId: parsed.driveId,
      field: "tags",
      oldValue: before || null,
      newValue: after || null,
      changedBy: user.username,
    });
  }

  revalidatePath(`/drives/${parsed.driveId}`);
  revalidatePath("/day/[date]", "page");

  return assigned;
}

const removeTagSchema = z.object({
  driveId: z.number().int().positive(),
  tagId: z.number().int().positive(),
});

/** Removes a tag assignment from a drive and records the change in audit_log. */
export async function removeTagFromDrive(
  driveId: number,
  tagId: number,
): Promise<void> {
  const t = await getTranslations("drives");
  const user = await validateSession();
  if (!user) throw new Error(t("errors.notAuthenticated"));

  const parsed = removeTagSchema.parse({ driveId, tagId });

  const before = await driveTagNames(parsed.driveId);

  await db
    .delete(driveTags)
    .where(
      and(eq(driveTags.driveId, parsed.driveId), eq(driveTags.tagId, parsed.tagId)),
    );

  const after = await driveTagNames(parsed.driveId);
  if (after !== before) {
    await db.insert(auditLog).values({
      entityType: "drive",
      entityId: parsed.driveId,
      field: "tags",
      oldValue: before || null,
      newValue: after || null,
      changedBy: user.username,
    });
  }

  revalidatePath(`/drives/${parsed.driveId}`);
  revalidatePath("/day/[date]", "page");
}

const whichSchema = z.enum(["start", "end"]);

const setDrivePlaceSchema = z.object({
  driveId: z.number().int().positive(),
  which: whichSchema,
  placeId: z.number().int().positive().nullable(), // null = "Automatisch"
});

/** Loads a place's name by id, or null if it doesn't exist. */
async function placeName(placeId: number | null): Promise<string | null> {
  if (placeId == null) return null;
  const rows = await db
    .select({ name: places.name })
    .from(places)
    .where(eq(places.id, placeId))
    .limit(1);
  return rows[0]?.name ?? null;
}

/**
 * Manually corrects a drive's start or end place (locks it), or unlocks it
 * back to automatic matching ("Automatisch" — placeId === null), recomputing
 * the match for that single drive immediately. Records one audit_log row.
 * Requires an authenticated session.
 */
export async function setDrivePlace(
  driveId: number,
  which: z.infer<typeof whichSchema>,
  placeId: number | null,
): Promise<void> {
  const t = await getTranslations("drives");
  const user = await validateSession();
  if (!user) throw new Error(t("errors.notAuthenticated"));

  const parsed = setDrivePlaceSchema.parse({ driveId, which, placeId });

  const idCol = parsed.which === "start" ? drives.startPlaceId : drives.endPlaceId;
  const lockedCol =
    parsed.which === "start" ? drives.startPlaceLocked : drives.endPlaceLocked;
  const latCol = parsed.which === "start" ? drives.startLat : drives.endLat;
  const lonCol = parsed.which === "start" ? drives.startLon : drives.endLon;

  const rows = await db
    .select({
      currentPlaceId: idCol,
      currentLocked: lockedCol,
      lat: latCol,
      lon: lonCol,
    })
    .from(drives)
    .where(eq(drives.id, parsed.driveId))
    .limit(1);
  const current = rows[0];
  if (!current) throw new Error(t("errors.driveNotFound"));

  let newPlaceId: number | null;
  let newLocked: boolean;

  if (parsed.placeId !== null) {
    // Manual assignment — lock it.
    newPlaceId = parsed.placeId;
    newLocked = true;
  } else {
    // "Automatisch" — unlock and recompute the match for this drive only.
    newLocked = false;
    const matchable = await db
      .select({ id: places.id, lat: places.lat, lon: places.lon, radiusM: places.radiusM })
      .from(places);
    newPlaceId = matchPlace(current.lat, current.lon, matchable);
  }

  if (newPlaceId === current.currentPlaceId && newLocked === current.currentLocked) {
    return; // no-op
  }

  const [oldName, newName] = await Promise.all([
    placeName(current.currentPlaceId),
    placeName(newPlaceId),
  ]);

  const field = parsed.which === "start" ? "start_place" : "end_place";
  const idField = parsed.which === "start" ? "startPlaceId" : "endPlaceId";
  const lockedField = parsed.which === "start" ? "startPlaceLocked" : "endPlaceLocked";

  await db.transaction(async (tx) => {
    await tx
      .update(drives)
      .set({
        [idField]: newPlaceId,
        [lockedField]: newLocked,
        updatedAt: new Date(),
      })
      .where(eq(drives.id, parsed.driveId));

    await tx.insert(auditLog).values({
      entityType: "drive",
      entityId: parsed.driveId,
      field,
      oldValue: oldName,
      newValue: newName,
      changedBy: user.username,
    });
  });

  revalidatePath(`/drives/${parsed.driveId}`);
  revalidatePath("/day/[date]", "page");
}

// ---------------------------------------------------------------------------
// Bulk-Bearbeitung (Fahrtenbuch-Kernfeature: viele Fahrten auf einmal)
// ---------------------------------------------------------------------------

const bulkUpdateSchema = z.object({
  driveIds: z.array(z.number().int().positive()).min(1).max(1000),
  classification: classificationSchema.optional(),
  addTagId: z.number().int().positive().optional(),
  customer: z.string().trim().max(200).optional(),
  project: z.string().trim().max(200).optional(),
  purpose: z.string().trim().max(500).optional(),
});

export interface BulkUpdateDrivesInput {
  driveIds: number[];
  classification?: z.infer<typeof classificationSchema>;
  addTagId?: number;
  customer?: string;
  project?: string;
  purpose?: string;
}

/** Empty/whitespace-only text field means "leave this field untouched". */
function bulkFieldValue(v: string | undefined): string | undefined {
  if (v === undefined) return undefined;
  const s = v.trim();
  return s === "" ? undefined : s;
}

/** Sorted tag names per drive (batched), for audit_log old/new values. */
async function driveTagNamesFor(
  driveIds: number[],
): Promise<Map<number, string[]>> {
  const map = new Map<number, string[]>();
  if (driveIds.length === 0) return map;
  const rows = await db
    .select({ driveId: driveTags.driveId, name: tags.name })
    .from(driveTags)
    .innerJoin(tags, eq(driveTags.tagId, tags.id))
    .where(inArray(driveTags.driveId, driveIds))
    .orderBy(asc(tags.name));
  for (const r of rows) {
    const list = map.get(r.driveId) ?? [];
    list.push(r.name);
    map.set(r.driveId, list);
  }
  return map;
}

interface AuditEntry {
  entityType: "drive";
  entityId: number;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
}

/**
 * Applies a partial set of annotations to many drives at once — the "classify
 * a whole day of drives in one go" flow. Only the fields actually provided are
 * written; each provided field is compared per drive and skipped where it is
 * already the target value (no phantom audit rows). Tag assignment is
 * idempotent (drive_tags, onConflictDoNothing). Everything runs in one
 * transaction and each real Drive+field change is recorded in audit_log
 * (oldValue → newValue, changedBy = username).
 *
 * Overwriting an auto-rule-classified drive is allowed and intentional; its
 * `classified_by_rule_id` is deliberately left in place as provenance/history.
 *
 * Returns the number of drives that actually changed.
 */
export async function bulkUpdateDrives(
  input: BulkUpdateDrivesInput,
): Promise<number> {
  const t = await getTranslations("drives");
  const user = await validateSession();
  if (!user) throw new Error(t("errors.notAuthenticated"));

  const parsed = bulkUpdateSchema.parse(input);
  const ids = [...new Set(parsed.driveIds)];

  const setClassification = parsed.classification;
  const setCustomer = bulkFieldValue(parsed.customer);
  const setProject = bulkFieldValue(parsed.project);
  const setPurpose = bulkFieldValue(parsed.purpose);
  const addTagId = parsed.addTagId;

  const hasFieldUpdate =
    setClassification !== undefined ||
    setCustomer !== undefined ||
    setProject !== undefined ||
    setPurpose !== undefined;
  if (!hasFieldUpdate && addTagId === undefined) return 0;

  // Current values — also narrows to ids that actually exist.
  const currentRows = await db
    .select({
      id: drives.id,
      classification: drives.classification,
      customer: drives.customer,
      project: drives.project,
      purpose: drives.purpose,
    })
    .from(drives)
    .where(inArray(drives.id, ids));
  if (currentRows.length === 0) return 0;
  const existingIds = currentRows.map((r) => r.id);

  // Tag preparation (name for audit, current sets, which drives already have it).
  let tagName: string | undefined;
  let tagNamesByDrive = new Map<number, string[]>();
  let alreadyTagged = new Set<number>();
  if (addTagId !== undefined) {
    const tagRow = (
      await db
        .select({ name: tags.name })
        .from(tags)
        .where(eq(tags.id, addTagId))
        .limit(1)
    )[0];
    if (!tagRow) throw new Error(t("errors.tagNotFound"));
    tagName = tagRow.name;
    tagNamesByDrive = await driveTagNamesFor(existingIds);
    const taggedRows = await db
      .select({ driveId: driveTags.driveId })
      .from(driveTags)
      .where(
        and(
          inArray(driveTags.driveId, existingIds),
          eq(driveTags.tagId, addTagId),
        ),
      );
    alreadyTagged = new Set(taggedRows.map((r) => r.driveId));
  }

  const changedIds = new Set<number>();
  const auditValues: AuditEntry[] = [];
  const push = (
    entityId: number,
    field: string,
    oldValue: string | null,
    newValue: string | null,
  ) =>
    auditValues.push({
      entityType: "drive",
      entityId,
      field,
      oldValue,
      newValue,
      changedBy: user.username,
    });

  await db.transaction(async (tx) => {
    const lockedRows = await tx.select().from(drives).where(inArray(drives.id, existingIds)).orderBy(asc(drives.id)).for("update");
    for (const row of lockedRows) {
      const patch: Record<string, unknown> = {};

      if (
        setClassification !== undefined &&
        row.classification !== setClassification
      ) {
        patch.classification = setClassification;
        push(row.id, "classification", row.classification, setClassification);
      }
      if (setCustomer !== undefined && row.customer !== setCustomer) {
        patch.customer = setCustomer;
        push(row.id, "customer", row.customer, setCustomer);
      }
      if (setProject !== undefined && row.project !== setProject) {
        patch.project = setProject;
        push(row.id, "project", row.project, setProject);
      }
      if (setPurpose !== undefined && row.purpose !== setPurpose) {
        patch.purpose = setPurpose;
        push(row.id, "purpose", row.purpose, setPurpose);
      }

      if (Object.keys(patch).length > 0) {
        patch.updatedAt = new Date();
        await tx.update(drives).set(patch).where(eq(drives.id, row.id));
        changedIds.add(row.id);
      }
    }

    if (addTagId !== undefined && tagName !== undefined) {
      for (const id of existingIds) {
        if (alreadyTagged.has(id)) continue;
        await tx
          .insert(driveTags)
          .values({ driveId: id, tagId: addTagId })
          .onConflictDoNothing();
        const before = tagNamesByDrive.get(id) ?? [];
        const after = [...before, tagName].sort((a, b) => a.localeCompare(b, "de"));
        push(id, "tags", before.join(", ") || null, after.join(", ") || null);
        changedIds.add(id);
      }
    }

    if (auditValues.length > 0) {
      await tx.insert(auditLog).values(auditValues);
    }
  });

  if (changedIds.size > 0) {
    revalidatePath("/");
    revalidatePath("/day/[date]", "page");
    revalidatePath("/search");
    for (const id of changedIds) revalidatePath(`/drives/${id}`);
  }

  return changedIds.size;
}
