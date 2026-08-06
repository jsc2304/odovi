import "server-only";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { chargeSessions, drives, places } from "@tripatlas/db";
import { summarizeDriveEnergy } from "@tripatlas/core";
import { db } from "./db";
import { APP_TIMEZONE } from "./config";
import { dayBounds } from "./day";
import type { CalendarDayStats } from "./calendarGrid";

/** [start, end) UTC instants for a YYYY-MM calendar month in APP_TIMEZONE. */
export function monthBounds(month: string): { start: Date; end: Date } {
  const firstOfMonth = `${month}-01`;
  const { start } = dayBounds(firstOfMonth);
  const [y, m] = month.split("-").map(Number);
  const nextMonth = m === 12 ? `${y! + 1}-01` : `${y}-${String(m! + 1).padStart(2, "0")}`;
  const { start: end } = dayBounds(`${nextMonth}-01`);
  return { start, end };
}

/**
 * Loads all drives for one vehicle across one calendar month, then groups them
 * by local calendar day in memory. The single query avoids N+1 work while
 * retaining the fields needed for weighted summaries and compact previews.
 */
async function loadDriveStatsByDay(
  vehicleId: number,
  month: string,
): Promise<Map<string, Omit<CalendarDayStats, "chargeCount">>> {
  const { start, end } = monthBounds(month);
  const startPlace = alias(places, "calendar_start_place");
  const endPlace = alias(places, "calendar_end_place");

  const rows = await db
    .select({
      id: drives.id,
      day: sql<string>`to_char(${drives.startTime} AT TIME ZONE ${APP_TIMEZONE}, 'YYYY-MM-DD')`.as(
        "day",
      ),
      startTime: drives.startTime,
      distanceKm: drives.distanceKm,
      consumedEnergyKwh: drives.consumedEnergyKwh,
      avgConsumptionWhKm: drives.avgConsumptionWhKm,
      energyIsEstimated: drives.energyIsEstimated,
      startPlaceName: startPlace.name,
      startAddress: drives.startAddress,
      endPlaceName: endPlace.name,
      endAddress: drives.endAddress,
    })
    .from(drives)
    .leftJoin(startPlace, eq(drives.startPlaceId, startPlace.id))
    .leftJoin(endPlace, eq(drives.endPlaceId, endPlace.id))
    .where(
      and(
        eq(drives.vehicleId, vehicleId),
        gte(drives.startTime, start),
        lt(drives.startTime, end),
      ),
    )
    .orderBy(drives.startTime);

  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = grouped.get(row.day) ?? [];
    list.push(row);
    grouped.set(row.day, list);
  }

  const map = new Map<string, Omit<CalendarDayStats, "chargeCount">>();
  for (const [day, dayRows] of grouped) {
    const energy = summarizeDriveEnergy(dayRows);
    map.set(day, {
      date: day,
      driveCount: dayRows.length,
      totalKm: energy.totalDistanceKm,
      totalEnergyKwh: energy.totalEnergyKwh,
      usableDistanceKm: energy.usableDistanceKm,
      avgConsumptionWhKm: energy.avgConsumptionWhKm,
      anyEstimated: energy.anyEstimated,
      hasIncompleteEnergy: energy.hasIncompleteEnergy,
      drives: dayRows.map((row) => ({
        id: row.id,
        startTimeIso: row.startTime.toISOString(),
        startPlaceName: row.startPlaceName,
        startAddress: row.startAddress,
        endPlaceName: row.endPlaceName,
        endAddress: row.endAddress,
        distanceKm: row.distanceKm,
        avgConsumptionWhKm: row.avgConsumptionWhKm,
        energyIsEstimated: row.energyIsEstimated,
      })),
    });
  }
  return map;
}

/**
 * Loads the set of local calendar days (APP_TIMEZONE) within the month that
 * had at least one charge session starting on that day.
 */
async function loadChargeDayCounts(
  vehicleId: number,
  month: string,
): Promise<Map<string, number>> {
  const { start, end } = monthBounds(month);

  const rows = await db
    .select({
      day: sql<string>`to_char(${chargeSessions.startTime} AT TIME ZONE ${APP_TIMEZONE}, 'YYYY-MM-DD')`.as(
        "day",
      ),
      chargeCount: sql<number>`count(*)::int`.as("charge_count"),
    })
    .from(chargeSessions)
    .where(
      and(
        eq(chargeSessions.vehicleId, vehicleId),
        gte(chargeSessions.startTime, start),
        lt(chargeSessions.startTime, end),
      ),
    )
    .groupBy(sql`1`);

  const map = new Map<string, number>();
  for (const r of rows) map.set(r.day, r.chargeCount);
  return map;
}

/**
 * Per-day stats for every day in the given month that has at least one drive
 * or charge session (empty days are simply absent from the map — the caller
 * fills in the grid).
 */
export async function getCalendarMonthStats(
  vehicleId: number,
  month: string,
): Promise<Map<string, CalendarDayStats>> {
  const [driveStats, chargeCounts] = await Promise.all([
    loadDriveStatsByDay(vehicleId, month),
    loadChargeDayCounts(vehicleId, month),
  ]);

  const days = new Set<string>([...driveStats.keys(), ...chargeCounts.keys()]);
  const map = new Map<string, CalendarDayStats>();
  for (const date of days) {
    const d = driveStats.get(date);
    map.set(date, {
      date,
      driveCount: d?.driveCount ?? 0,
      totalKm: d?.totalKm ?? 0,
      chargeCount: chargeCounts.get(date) ?? 0,
      totalEnergyKwh: d?.totalEnergyKwh ?? 0,
      usableDistanceKm: d?.usableDistanceKm ?? 0,
      avgConsumptionWhKm: d?.avgConsumptionWhKm ?? null,
      anyEstimated: d?.anyEstimated ?? false,
      hasIncompleteEnergy: d?.hasIncompleteEnergy ?? false,
      drives: d?.drives ?? [],
    });
  }
  return map;
}
