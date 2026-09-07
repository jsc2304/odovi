import "server-only";

import { and, asc, eq, gt, gte, isNotNull, lt, lte, sql } from "drizzle-orm";
import { buildYearlyInsights, type YearlyClassificationFilter, type YearlyInsights } from "@odovi/core";
import { chargeSessions, drives, places } from "@odovi/db";
import { db } from "./db";
import { APP_TIMEZONE } from "./config";
import { currentInsightYear, insightYearBounds } from "./yearlyFilters";

/** Existing archive metadata only: no route points, provider or vehicle calls. */
export async function getYearlyInsights(
  vehicleId: number,
  year: number,
  classification: YearlyClassificationFilter,
): Promise<YearlyInsights> {
  const { start, end } = insightYearBounds(year);
  const now = new Date();
  const [driveRows, chargeRows, placeRows] = await Promise.all([
    db.select({
      id: drives.id, startTime: drives.startTime, endTime: drives.endTime,
      classification: drives.classification,
      distanceKm: drives.distanceKm, durationSeconds: drives.durationSeconds,
      consumedEnergyKwh: drives.consumedEnergyKwh, energyIsEstimated: drives.energyIsEstimated,
      endPlaceId: drives.endPlaceId, endLat: drives.endLat, endLon: drives.endLon,
      endAddress: drives.endAddress,
    }).from(drives).where(and(
      eq(drives.vehicleId, vehicleId),
      isNotNull(drives.endTime), gt(drives.endTime, drives.startTime), lte(drives.endTime, now),
      gte(drives.startTime, start), lt(drives.startTime, end),
      classification === "all" ? undefined : eq(drives.classification, classification),
    )).orderBy(asc(drives.startTime), asc(drives.id)),
    // Charge sessions have no drive classification; these always cover the year.
    db.select({
      id: chargeSessions.id, startTime: chargeSessions.startTime, endTime: chargeSessions.endTime,
      energyAddedKwh: chargeSessions.energyAddedKwh, maxPowerKw: chargeSessions.maxPowerKw,
      chargerType: chargeSessions.chargerType, cost: chargeSessions.cost, currency: chargeSessions.currency,
      placeId: chargeSessions.placeId, address: chargeSessions.address,
    }).from(chargeSessions).where(and(
      eq(chargeSessions.vehicleId, vehicleId),
      isNotNull(chargeSessions.endTime), gt(chargeSessions.endTime, chargeSessions.startTime), lte(chargeSessions.endTime, now),
      gte(chargeSessions.startTime, start), lt(chargeSessions.startTime, end),
    )).orderBy(asc(chargeSessions.startTime), asc(chargeSessions.id)),
    db.select({ id: places.id, name: places.name, type: places.type, lat: places.lat, lon: places.lon })
      .from(places).orderBy(asc(places.id)),
  ]);

  return buildYearlyInsights({
    year, timeZone: APP_TIMEZONE, classification, now: now.getTime(), places: placeRows,
    drives: driveRows.map((drive) => ({
      ...drive, startTime: drive.startTime.getTime(), endTime: drive.endTime!.getTime(),
    })),
    charges: chargeRows.map((charge) => ({
      ...charge, startTime: charge.startTime.getTime(), endTime: charge.endTime!.getTime(),
    })),
  });
}

/** Years with completed local archive records, plus the current calendar year. */
export async function getInsightYears(vehicleId: number): Promise<number[]> {
  const now = new Date();
  const currentYear = currentInsightYear(now);
  // PostgreSQL AT TIME ZONE assigns New Year's boundary records consistently
  // with the app's date views. All expressions remain parameterized by Drizzle.
  const driveYear = sql<number>`extract(year from ${drives.startTime} at time zone ${APP_TIMEZONE})::int`;
  const chargeYear = sql<number>`extract(year from ${chargeSessions.startTime} at time zone ${APP_TIMEZONE})::int`;
  const [driveYears, chargeYears] = await Promise.all([
    db.selectDistinct({ year: driveYear }).from(drives).where(and(
      eq(drives.vehicleId, vehicleId), isNotNull(drives.endTime),
      gt(drives.endTime, drives.startTime), lte(drives.endTime, now),
    )),
    db.selectDistinct({ year: chargeYear }).from(chargeSessions).where(and(
      eq(chargeSessions.vehicleId, vehicleId), isNotNull(chargeSessions.endTime),
      gt(chargeSessions.endTime, chargeSessions.startTime), lte(chargeSessions.endTime, now),
    )),
  ]);
  return [...new Set([currentYear, ...driveYears.map((row) => row.year), ...chargeYears.map((row) => row.year)])]
    .filter((year) => Number.isInteger(year) && year >= 1970 && year <= currentYear)
    .sort((a, b) => b - a);
}
