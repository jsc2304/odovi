import "server-only";

import { and, asc, eq, gt, isNotNull, lte } from "drizzle-orm";
import { buildBatteryRangeTrend, type BatteryRangeTrend } from "@odovi/core";
import { chargeSessions } from "@odovi/db";
import { db } from "./db";
import { APP_TIMEZONE } from "./config";

/** Read independent BMS observations only from this vehicle's completed archive. */
export async function getBatteryRangeTrend(vehicleId: number): Promise<BatteryRangeTrend> {
  const now = new Date();
  const charges = await db.select({
    startTime: chargeSessions.startTime,
    endTime: chargeSessions.endTime,
    endSoc: chargeSessions.endSoc,
    endRatedRangeKm: chargeSessions.endRatedRangeKm,
    energyAddedKwh: chargeSessions.energyAddedKwh,
  }).from(chargeSessions).where(and(
    eq(chargeSessions.vehicleId, vehicleId),
    isNotNull(chargeSessions.endTime),
    gt(chargeSessions.endTime, chargeSessions.startTime),
    lte(chargeSessions.endTime, now),
  )).orderBy(asc(chargeSessions.endTime), asc(chargeSessions.id));

  return buildBatteryRangeTrend(charges.map((charge) => ({
    ...charge, startTime: charge.startTime.getTime(), endTime: charge.endTime!.getTime(),
  })), APP_TIMEZONE, now.getTime());
}
