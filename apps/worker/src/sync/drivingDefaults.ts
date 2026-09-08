import { and, asc, eq, gt, inArray, isNotNull, like, sql } from "drizzle-orm";
import { auditLog, classificationRules, drives, settings, vehicles, type Db } from "@odovi/db";
import { drivingProfileKey, parseDrivingProfile, type DrivingProfile } from "@odovi/core";
import { applyClassificationRules } from "./classifyRules.js";

function eligible(vehicleId: number, profile: DrivingProfile) {
  return and(
    eq(drives.vehicleId, vehicleId), eq(drives.classification, "unclassified"),
    isNotNull(drives.endTime), gt(drives.startTime, new Date(profile.effectiveFrom)),
    // Includes explicit unclassification and Undo: later syncs must respect them.
    sql`not exists (select 1 from ${auditLog} where ${auditLog.entityType} = 'drive' and ${auditLog.entityId} = ${drives.id} and ${auditLog.field} = 'classification')`,
    // A tag-only rule permits a fallback; a rule explicitly choosing open does not.
    sql`not exists (select 1 from ${classificationRules} where ${classificationRules.id} = ${drives.classifiedByRuleId} and ${classificationRules.classification} is not null)`,
  );
}

export async function applyDrivingDefaults(db: Db, appTimezone: string) {
  const profiles = await db.select().from(settings).where(like(settings.key, "driving-profile:%"));
  let applied = 0;
  for (const row of profiles) {
    const match = /^driving-profile:([1-9]\d*)$/.exec(row.key);
    const vehicleId = Number(match?.[1]);
    const profile = parseDrivingProfile(row.value);
    if (!match || !Number.isSafeInteger(vehicleId) || !profile || profile.usage === "balanced") continue;
    const candidates = await db.select({ id: drives.id }).from(drives).where(eligible(vehicleId, profile))
      .orderBy(asc(drives.id)).limit(500);
    if (!candidates.length) continue;
    const ids = candidates.map(d => d.id);
    // Give these drives their own rules pass even if an older unmatched backlog
    // filled the normal rules batch. A fallback must never jump ahead of a rule.
    await applyClassificationRules(db, appTimezone, ids);
    applied += await db.transaction(async (tx) => {
      await tx.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.id, vehicleId)).for("update");
      const [current] = await tx.select().from(settings).where(eq(settings.key, drivingProfileKey(vehicleId)));
      const active = parseDrivingProfile(current?.value);
      if (!active || active.usage === "balanced") return 0;
      // Lock first, then check audit history in a fresh statement snapshot.
      await tx.select({ id: drives.id }).from(drives).where(inArray(drives.id, ids)).orderBy(asc(drives.id)).for("update");
      const remaining = await tx.select({ id: drives.id }).from(drives).where(and(inArray(drives.id, ids), eligible(vehicleId, active)));
      if (!remaining.length) return 0;
      await tx.update(drives).set({ classification: active.usage, updatedAt: new Date() })
        .where(inArray(drives.id, remaining.map(d => d.id)));
      await tx.insert(auditLog).values(remaining.map(d => ({ entityType: "drive", entityId: d.id,
        field: "classification", oldValue: "unclassified", newValue: active.usage,
        changedBy: `default:${active.usage}` })));
      return remaining.length;
    });
  }
  return { applied };
}
