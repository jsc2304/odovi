import "server-only";
import { and, asc, eq, gt, gte, isNotNull, lt, lte } from "drizzle-orm";
import { chargeSessions, places } from "@odovi/db";
import { summarizeChargingEconomics } from "@odovi/core";
import { db } from "./db";
import { monthBounds } from "./calendar";
import { todayInAppTz } from "./day";

/** Single calendar month; malformed and repeated query values use the current month. */
export function parseEconomicsMonth(value: string | string[] | undefined): string {
  return typeof value === "string" && /^(?:19[7-9]\d|[2-9]\d{3})-(?:0[1-9]|1[0-2])$/.test(value)
    ? value : todayInAppTz().slice(0, 7);
}

export function shiftEconomicsMonth(month: string, delta: number): string {
  const [year, number] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year!, number! - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Selection is by session start; only valid, completed sessions enter the report. */
export async function getChargingEconomics(vehicleId: number, month: string, now = new Date()) {
  const { start, end } = monthBounds(month);
  const sessions = await db.select({
    energyAddedKwh: chargeSessions.energyAddedKwh, energyUsedKwh: chargeSessions.energyUsedKwh,
    cost: chargeSessions.cost, currency: chargeSessions.currency, chargerType: chargeSessions.chargerType,
    placeId: chargeSessions.placeId, placeName: places.name, address: chargeSessions.address,
  }).from(chargeSessions).leftJoin(places, eq(chargeSessions.placeId, places.id)).where(and(
    eq(chargeSessions.vehicleId, vehicleId), gte(chargeSessions.startTime, start), lt(chargeSessions.startTime, end),
    isNotNull(chargeSessions.endTime), gt(chargeSessions.endTime, chargeSessions.startTime), lte(chargeSessions.endTime, now),
  )).orderBy(asc(chargeSessions.startTime), asc(chargeSessions.id));
  return summarizeChargingEconomics(sessions);
}
