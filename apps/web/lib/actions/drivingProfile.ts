"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { auditLog, drives, settings, vehicles } from "@odovi/db";
import { DRIVING_USAGES, drivingProfileKey, parseDrivingProfile } from "@odovi/core";
import { db } from "../db";
import { validateSession } from "../auth/session";

const idSchema = z.number().int().positive();
const usageSchema = z.enum(DRIVING_USAGES);
const defaultSchema = z.enum(["private", "business"]);

function refresh() {
  revalidatePath("/");
  revalidatePath("/settings");
  revalidatePath("/search");
  revalidatePath("/day/[date]", "page");
  revalidatePath("/drives/[id]", "page");
}

export async function saveDrivingProfile(vehicleId: number, usage: z.infer<typeof usageSchema>) {
  const t = await getTranslations("dashboard.drivingProfile");
  const user = await validateSession();
  if (!user) throw new Error(t("notAuthenticated"));
  const id = idSchema.parse(vehicleId);
  const selected = usageSchema.parse(usage);
  await db.transaction(async (tx) => {
    const [vehicle] = await tx.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.id, id)).for("update");
    if (!vehicle) throw new Error(t("vehicleMissing"));
    const key = drivingProfileKey(id);
    const [row] = await tx.select().from(settings).where(eq(settings.key, key));
    const before = parseDrivingProfile(row?.value);
    // Re-saving the same choice must not move its boundary and lose eligible drives.
    if (before?.usage === selected) return;
    const profile = { usage: selected, effectiveFrom: new Date().toISOString() };
    await tx.insert(settings).values({ key, value: profile }).onConflictDoUpdate({
      target: settings.key, set: { value: profile, updatedAt: new Date() },
    });
    await tx.insert(auditLog).values({ entityType: "vehicle", entityId: id, field: "driving_profile",
      oldValue: before ? JSON.stringify(before) : null, newValue: JSON.stringify(profile), changedBy: user.username });
  });
  refresh();
}

/** Explicitly applies the displayed default to completed, open drives of this vehicle. */
export async function classifyOpenDrives(vehicleId: number, expectedUsage: "private" | "business") {
  const t = await getTranslations("dashboard.drivingProfile");
  const user = await validateSession();
  if (!user) throw new Error(t("notAuthenticated"));
  const id = idSchema.parse(vehicleId);
  const classification = defaultSchema.parse(expectedUsage);
  const result = await db.transaction(async (tx) => {
    await tx.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.id, id)).for("update");
    const [row] = await tx.select().from(settings).where(eq(settings.key, drivingProfileKey(id)));
    if (parseDrivingProfile(row?.value)?.usage !== classification) throw new Error(t("profileChanged"));
    const open = await tx.select({ id: drives.id }).from(drives).where(and(
      eq(drives.vehicleId, id), eq(drives.classification, "unclassified"), isNotNull(drives.endTime),
    )).orderBy(asc(drives.id)).for("update");
    if (!open.length) return { count: 0, batchId: null };
    const auditIds: number[] = [];
    // Bound SQL parameter counts even for a long imported history.
    for (let offset = 0; offset < open.length; offset += 500) {
      const chunk = open.slice(offset, offset + 500);
      await tx.update(drives).set({ classification, updatedAt: new Date() }).where(inArray(drives.id, chunk.map(d => d.id)));
      const entries = await tx.insert(auditLog).values(chunk.map(d => ({
        entityType: "drive", entityId: d.id, field: "classification",
        oldValue: "unclassified", newValue: classification, changedBy: user.username,
      }))).returning({ id: auditLog.id, driveId: auditLog.entityId });
      auditIds.push(...entries.sort((a, b) => a.driveId - b.driveId).map(entry => entry.id));
    }
    const [batch] = await tx.insert(auditLog).values({ entityType: "vehicle", entityId: id,
      field: "default_classification_batch", oldValue: null,
      newValue: JSON.stringify({ classification, auditIds }), changedBy: user.username,
    }).returning({ id: auditLog.id });
    return { count: open.length, batchId: batch!.id };
  });
  refresh();
  return result;
}

/** A batch undo skips newer edits; its audit record also makes replay harmless. */
export async function undoOpenDrives(batchId: number) {
  const t = await getTranslations("dashboard.drivingProfile");
  const user = await validateSession();
  if (!user) throw new Error(t("notAuthenticated"));
  const id = idSchema.parse(batchId);
  const result = await db.transaction(async (tx) => {
    const [batch] = await tx.select().from(auditLog).where(and(eq(auditLog.id, id),
      eq(auditLog.entityType, "vehicle"), eq(auditLog.field, "default_classification_batch"),
      eq(auditLog.changedBy, user.username))).for("update");
    if (!batch?.newValue) throw new Error(t("undoUnavailable"));
    const [previousUndo] = await tx.select({ id: auditLog.id }).from(auditLog).where(and(
      eq(auditLog.entityType, "vehicle"), eq(auditLog.entityId, batch.entityId),
      eq(auditLog.field, "default_classification_undo"), eq(auditLog.oldValue, String(id)),
    )).limit(1);
    if (previousUndo) throw new Error(t("undoUnavailable"));
    const data = z.object({ classification: defaultSchema, auditIds: z.array(idSchema) }).parse(JSON.parse(batch.newValue));
    let restored = 0;
    // Audit ids were created in drive-id order, shared with other classification writers.
    for (let offset = 0; offset < data.auditIds.length; offset += 500) {
      const entries = await tx.select().from(auditLog).where(and(
        inArray(auditLog.id, data.auditIds.slice(offset, offset + 500)),
        eq(auditLog.entityType, "drive"), eq(auditLog.field, "classification"), eq(auditLog.changedBy, user.username),
      ));
      if (!entries.length) continue;
      const ids = entries.map(entry => entry.entityId);
      const current = await tx.select({ id: drives.id, classification: drives.classification }).from(drives)
        .where(and(eq(drives.vehicleId, batch.entityId), inArray(drives.id, ids))).orderBy(asc(drives.id)).for("update");
      const latest = await tx.select({ driveId: auditLog.entityId, auditId: sql<number>`max(${auditLog.id})::bigint` })
        .from(auditLog).where(and(eq(auditLog.entityType, "drive"), eq(auditLog.field, "classification"), inArray(auditLog.entityId, ids)))
        .groupBy(auditLog.entityId);
      const latestByDrive = new Map(latest.map(entry => [entry.driveId, Number(entry.auditId)]));
      const batchByDrive = new Map(entries.map(entry => [entry.entityId, entry.id]));
      const eligible = current.filter(d => d.classification === data.classification && latestByDrive.get(d.id) === batchByDrive.get(d.id));
      if (!eligible.length) continue;
      await tx.update(drives).set({ classification: "unclassified", updatedAt: new Date() }).where(inArray(drives.id, eligible.map(d => d.id)));
      await tx.insert(auditLog).values(eligible.map(d => ({ entityType: "drive", entityId: d.id,
        field: "classification", oldValue: data.classification, newValue: "unclassified", changedBy: user.username })));
      restored += eligible.length;
    }
    const result = { restored, skipped: data.auditIds.length - restored };
    await tx.insert(auditLog).values({ entityType: "vehicle", entityId: batch.entityId,
      field: "default_classification_undo", oldValue: String(id), newValue: JSON.stringify(result), changedBy: user.username });
    return result;
  });
  refresh();
  return result;
}
