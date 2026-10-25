import "server-only";
import { and, desc, eq, gt, isNull, lte, sql } from "drizzle-orm";
import { chargeSessions, drives } from "@odovi/db";
import { summarizeSinceChargeDrives, type SinceChargeSummary } from "@odovi/core";
import { db } from "./db";

export type SinceChargeStats =
  | { state: "no-charge" }
  | { state: "charging" }
  | ({ state: "ready"; chargeId: number; chargeEndTime: Date } & SinceChargeSummary);

export async function getSinceChargeStats(vehicleId: number, now = new Date()): Promise<SinceChargeStats> {
  if (!Number.isSafeInteger(vehicleId) || vehicleId <= 0 || !Number.isFinite(now.getTime())) return { state: "no-charge" };
  const active = await db.select({ id: chargeSessions.id }).from(chargeSessions)
    .where(and(eq(chargeSessions.vehicleId, vehicleId), isNull(chargeSessions.endTime), lte(chargeSessions.startTime, now)))
    .limit(1);
  if (active.length) return { state: "charging" };

  const [charge] = await db.select({ id: chargeSessions.id, endTime: chargeSessions.endTime }).from(chargeSessions)
    .where(and(eq(chargeSessions.vehicleId, vehicleId), lte(chargeSessions.endTime, now),
      gt(chargeSessions.endTime, chargeSessions.startTime)))
    .orderBy(desc(chargeSessions.endTime), desc(chargeSessions.id)).limit(1);
  if (!charge?.endTime) return { state: "no-charge" };

  const rows = await db.select({
    startTime: drives.startTime, endTime: drives.endTime, distanceKm: drives.distanceKm,
    durationSeconds: drives.durationSeconds, consumedEnergyKwh: drives.consumedEnergyKwh,
    energyIsEstimated: drives.energyIsEstimated,
  }).from(drives).where(and(eq(drives.vehicleId, vehicleId), gt(drives.endTime, charge.endTime),
    lte(drives.endTime, now), sql`${drives.endTime} > ${drives.startTime}`));
  return {
    state: "ready", chargeId: charge.id, chargeEndTime: charge.endTime,
    ...summarizeSinceChargeDrives(rows.map((drive) => ({ ...drive,
      startTime: drive.startTime.getTime(), endTime: drive.endTime?.getTime() ?? null,
    })), charge.endTime.getTime(), now.getTime()),
  };
}
