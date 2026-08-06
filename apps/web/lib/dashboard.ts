import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lt, notInArray, sql } from "drizzle-orm";
import {
  chargeSessions,
  drives,
  parkSessions,
  places,
  routePoints,
  vehicleStatus,
  vehicles,
} from "@tripatlas/db";
import {
  matchPlace,
  summarizeDriveEnergy,
  type MatchablePlace,
} from "@tripatlas/core";
import { db } from "./db";
import { dayBounds, shiftDate, todayInAppTz } from "./day";

export interface VehicleStatusRow {
  vehicleId: number;
  displayName: string;
  ts: Date | null;
  lat: number | null;
  lon: number | null;
  soc: number | null;
  ratedRangeKm: number | null;
  odometerKm: number | null;
  state: string | null;
  stateSince: Date | null;
  syncedAt: Date | null;
  placeName: string | null;
  tpmsFlBar: number | null;
  tpmsFrBar: number | null;
  tpmsRlBar: number | null;
  tpmsRrBar: number | null;
}

/**
 * Latest known vehicle status (vehicle_status, worker-synced) joined with the
 * vehicle name and a place match (geofence radius, same rule as drives/parks —
 * no reverse geocoding in the MVP). Returns null if no vehicle exists yet.
 */
export async function getVehicleStatus(
  vehicleId: number,
): Promise<VehicleStatusRow | null> {
  const rows = await db
    .select({
      vehicleId: vehicles.id,
      displayName: vehicles.displayName,
      ts: vehicleStatus.ts,
      lat: vehicleStatus.lat,
      lon: vehicleStatus.lon,
      soc: vehicleStatus.soc,
      ratedRangeKm: vehicleStatus.ratedRangeKm,
      odometerKm: vehicleStatus.odometerKm,
      state: vehicleStatus.state,
      stateSince: vehicleStatus.stateSince,
      syncedAt: vehicleStatus.syncedAt,
      tpmsFlBar: vehicleStatus.tpmsFlBar,
      tpmsFrBar: vehicleStatus.tpmsFrBar,
      tpmsRlBar: vehicleStatus.tpmsRlBar,
      tpmsRrBar: vehicleStatus.tpmsRrBar,
    })
    .from(vehicles)
    .leftJoin(vehicleStatus, eq(vehicleStatus.vehicleId, vehicles.id))
    .where(eq(vehicles.id, vehicleId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  let placeName: string | null = null;
  if (row.lat != null && row.lon != null) {
    const matchable = await loadMatchablePlaces();
    const placeId = matchPlace(row.lat, row.lon, matchable);
    if (placeId != null) {
      const placeRows = await db
        .select({ name: places.name })
        .from(places)
        .where(eq(places.id, placeId))
        .limit(1);
      placeName = placeRows[0]?.name ?? null;
    }
  }

  return { ...row, placeName };
}

async function loadMatchablePlaces(): Promise<MatchablePlace[]> {
  return db
    .select({ id: places.id, lat: places.lat, lon: places.lon, radiusM: places.radiusM })
    .from(places);
}

export type OpenSessionStatus =
  | { kind: "driving" }
  | { kind: "charging"; energyAddedKwh: number | null }
  | { kind: "parked"; since: Date | null; placeName: string | null };

/**
 * Derives the "what's the car doing right now" status line primarily from
 * open sessions (most reliable — they reflect the actual synced session
 * state), not from vehicle_status.state alone. Checks drive → charge → park,
 * in that priority order (a car can't be mid-drive and mid-charge at once,
 * but checking drive first is the safest tie-break).
 */
export async function getOpenSessionStatus(
  vehicleId: number,
): Promise<OpenSessionStatus | null> {
  const openDrive = await db
    .select({ id: drives.id })
    .from(drives)
    .where(and(eq(drives.vehicleId, vehicleId), isNull(drives.endTime)))
    .limit(1);
  if (openDrive.length > 0) return { kind: "driving" };

  const openCharge = await db
    .select({ energyAddedKwh: chargeSessions.energyAddedKwh })
    .from(chargeSessions)
    .where(and(eq(chargeSessions.vehicleId, vehicleId), isNull(chargeSessions.endTime)))
    .limit(1);
  if (openCharge.length > 0) {
    return { kind: "charging", energyAddedKwh: openCharge[0]!.energyAddedKwh };
  }

  const openPark = await db
    .select({
      startTime: parkSessions.startTime,
      placeName: places.name,
    })
    .from(parkSessions)
    .leftJoin(places, eq(parkSessions.placeId, places.id))
    .where(and(eq(parkSessions.vehicleId, vehicleId), isNull(parkSessions.endTime)))
    .limit(1);
  if (openPark.length > 0) {
    return {
      kind: "parked",
      since: openPark[0]!.startTime,
      placeName: openPark[0]!.placeName,
    };
  }

  return null;
}

export interface RecentDriveRow {
  id: number;
  startTime: Date;
  endTime: Date | null;
  distanceKm: number | null;
  durationSeconds: number | null;
  avgConsumptionWhKm: number | null;
  energyIsEstimated: boolean;
  startSoc: number | null;
  endSoc: number | null;
  classification: "unclassified" | "private" | "business" | "commute";
  startPlaceName: string | null;
  startAddress: string | null;
  startLat: number | null;
  startLon: number | null;
  endPlaceName: string | null;
  endAddress: string | null;
  endLat: number | null;
  endLon: number | null;
}

/** Last N completed drives (any day), newest first — for the dashboard card. */
export async function getRecentDrives(
  vehicleId: number,
  limit = 5,
): Promise<RecentDriveRow[]> {
  const sp = places;
  const rows = await db
    .select({
      id: drives.id,
      startTime: drives.startTime,
      endTime: drives.endTime,
      distanceKm: drives.distanceKm,
      durationSeconds: drives.durationSeconds,
      avgConsumptionWhKm: drives.avgConsumptionWhKm,
      energyIsEstimated: drives.energyIsEstimated,
      startSoc: drives.startSoc,
      endSoc: drives.endSoc,
      classification: drives.classification,
      startPlaceId: drives.startPlaceId,
      startAddress: drives.startAddress,
      startLat: drives.startLat,
      startLon: drives.startLon,
      endPlaceId: drives.endPlaceId,
      endAddress: drives.endAddress,
      endLat: drives.endLat,
      endLon: drives.endLon,
    })
    .from(drives)
    .where(and(eq(drives.vehicleId, vehicleId), sql`${drives.endTime} IS NOT NULL`))
    .orderBy(desc(drives.startTime))
    .limit(limit);

  const placeIds = new Set<number>();
  for (const d of rows) {
    if (d.startPlaceId != null) placeIds.add(d.startPlaceId);
    if (d.endPlaceId != null) placeIds.add(d.endPlaceId);
  }
  const placeNameById = new Map<number, string>();
  if (placeIds.size > 0) {
    const placeRows = await db
      .select({ id: sp.id, name: sp.name })
      .from(sp)
      .where(inArray(sp.id, [...placeIds]));
    for (const p of placeRows) placeNameById.set(p.id, p.name);
  }

  return rows.map((d) => ({
    id: d.id,
    startTime: d.startTime,
    endTime: d.endTime,
    distanceKm: d.distanceKm,
    durationSeconds: d.durationSeconds,
    avgConsumptionWhKm: d.avgConsumptionWhKm,
    energyIsEstimated: d.energyIsEstimated,
    startSoc: d.startSoc,
    endSoc: d.endSoc,
    classification: d.classification,
    startPlaceName: d.startPlaceId != null ? placeNameById.get(d.startPlaceId) ?? null : null,
    startAddress: d.startAddress,
    startLat: d.startLat,
    startLon: d.startLon,
    endPlaceName: d.endPlaceId != null ? placeNameById.get(d.endPlaceId) ?? null : null,
    endAddress: d.endAddress,
    endLat: d.endLat,
    endLon: d.endLon,
  }));
}

export interface DriveTrack {
  driveId: number;
  /** [lat, lon] tuples, ordered by ts, thinned to at most MAX_TRACK_POINTS. */
  points: [number, number][];
}

// Keep the dashboard map payload lean — this is not the detailed per-drive
// chart (see lib/driveRoute.ts), just an overview polyline per recent drive.
const MAX_TRACK_POINTS = 150;

/**
 * Route points for a set of drives (dashboard overview map), thinned
 * server-side to at most MAX_TRACK_POINTS per drive. One query for all
 * drives, grouped in TS to avoid N+1 round-trips.
 */
export async function getRecentDriveTracks(driveIds: number[]): Promise<DriveTrack[]> {
  if (driveIds.length === 0) return [];

  const rows = await db
    .select({
      driveId: routePoints.driveId,
      lat: routePoints.lat,
      lon: routePoints.lon,
      ts: routePoints.ts,
    })
    .from(routePoints)
    .where(inArray(routePoints.driveId, driveIds))
    .orderBy(asc(routePoints.driveId), asc(routePoints.ts));

  const byDrive = new Map<number, { lat: number; lon: number }[]>();
  for (const r of rows) {
    let list = byDrive.get(r.driveId);
    if (!list) {
      list = [];
      byDrive.set(r.driveId, list);
    }
    list.push({ lat: r.lat, lon: r.lon });
  }

  const tracks: DriveTrack[] = [];
  for (const [driveId, pts] of byDrive) {
    const thinned = thinPoints(pts, MAX_TRACK_POINTS);
    tracks.push({ driveId, points: thinned.map((p) => [p.lat, p.lon]) });
  }
  return tracks;
}

/** Keep every nth row so the result has at most `max` entries, always
 * including the first and last point (mirrors lib/driveRoute.ts thin()). */
function thinPoints<T>(rows: T[], max: number): T[] {
  if (rows.length <= max) return rows;
  const step = Math.ceil(rows.length / max);
  const out: T[] = [];
  for (let i = 0; i < rows.length; i += step) {
    out.push(rows[i]!);
  }
  const last = rows[rows.length - 1]!;
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

export interface TodayStats {
  distanceKm: number;
  driveCount: number;
  energyKwh: number;
  avgConsumptionWhKm: number | null;
  anyEstimated: boolean;
  hasIncompleteEnergy: boolean;
}

/** Km + drive count for "today" (APP_TIMEZONE calendar day). */
export async function getTodayStats(vehicleId: number): Promise<TodayStats> {
  const { start, end } = dayBounds(todayInAppTz());
  return getDriveStatsInRange(vehicleId, start, end);
}

export interface WeekStats {
  distanceKm: number;
  driveCount: number;
  energyKwh: number;
  avgConsumptionWhKm: number | null;
  anyEstimated: boolean;
  hasIncompleteEnergy: boolean;
}

/** Km + drive count for the current Monday-based week (APP_TIMEZONE). */
export async function getWeekStats(vehicleId: number): Promise<WeekStats> {
  const today = todayInAppTz();
  const [y, m, d] = today.split("-").map(Number);
  const jsDay = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay(); // 0=Sun..6=Sat
  const mondayIndex = (jsDay + 6) % 7; // 0=Mon..6=Sun
  const monday = shiftDate(today, -mondayIndex);
  const sunday = shiftDate(monday, 7);

  const { start } = dayBounds(monday);
  const { start: end } = dayBounds(sunday);
  return getDriveStatsInRange(vehicleId, start, end);
}

async function getDriveStatsInRange(
  vehicleId: number,
  start: Date,
  end: Date,
): Promise<TodayStats> {
  const rows = await db
    .select({
      distanceKm: drives.distanceKm,
      consumedEnergyKwh: drives.consumedEnergyKwh,
      energyIsEstimated: drives.energyIsEstimated,
    })
    .from(drives)
    .where(
      and(
        eq(drives.vehicleId, vehicleId),
        gte(drives.startTime, start),
        lt(drives.startTime, end),
      ),
    );
  const energy = summarizeDriveEnergy(rows);
  return {
    distanceKm: energy.totalDistanceKm,
    driveCount: rows.length,
    energyKwh: energy.totalEnergyKwh,
    avgConsumptionWhKm: energy.avgConsumptionWhKm,
    anyEstimated: energy.anyEstimated,
    hasIncompleteEnergy: energy.hasIncompleteEnergy,
  };
}

export interface LastChargeStats {
  id: number;
  energyAddedKwh: number | null;
  endTime: Date;
  startSoc: number | null;
  endSoc: number | null;
  durationSeconds: number | null;
  chargerType: "ac" | "dc" | null;
  cost: string | null;
  currency: string | null;
  costSource: string | null;
  placeName: string | null;
  address: string | null;
}

/** Most recently completed charge session, for the mini-stats row. */
export async function getLastCharge(vehicleId: number): Promise<LastChargeStats | null> {
  const rows = await db
    .select({
      id: chargeSessions.id,
      energyAddedKwh: chargeSessions.energyAddedKwh,
      endTime: chargeSessions.endTime,
      startSoc: chargeSessions.startSoc,
      endSoc: chargeSessions.endSoc,
      durationSeconds: chargeSessions.durationSeconds,
      chargerType: chargeSessions.chargerType,
      cost: chargeSessions.cost,
      currency: chargeSessions.currency,
      costSource: chargeSessions.costSource,
      address: chargeSessions.address,
      placeName: places.name,
    })
    .from(chargeSessions)
    .leftJoin(places, eq(chargeSessions.placeId, places.id))
    .where(and(eq(chargeSessions.vehicleId, vehicleId), sql`${chargeSessions.endTime} IS NOT NULL`))
    .orderBy(desc(chargeSessions.endTime))
    .limit(1);

  const row = rows[0];
  if (!row || !row.endTime) return null;
  return {
    id: row.id,
    energyAddedKwh: row.energyAddedKwh,
    endTime: row.endTime,
    startSoc: row.startSoc,
    endSoc: row.endSoc,
    durationSeconds: row.durationSeconds,
    chargerType: row.chargerType,
    cost: row.cost,
    currency: row.currency,
    costSource: row.costSource,
    placeName: row.placeName,
    address: row.address,
  };
}

export interface UnclassifiedCount {
  live: number;
  imported: number;
}

// Historische Importquellen, die nicht als laufender Klassifizierungsbedarf zählen.
const IMPORTED_SOURCES = ["tessie"];

/** Count of unclassified drives — live drives power the dashboard CTA. */
export async function getUnclassifiedCount(vehicleId: number): Promise<UnclassifiedCount> {
  const baseWhere = and(eq(drives.vehicleId, vehicleId), eq(drives.classification, "unclassified"));
  const [liveRows, importedRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(drives)
      .where(and(baseWhere, notInArray(drives.source, IMPORTED_SOURCES))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(drives)
      .where(and(baseWhere, inArray(drives.source, IMPORTED_SOURCES))),
  ]);

  return {
    live: liveRows[0]?.count ?? 0,
    imported: importedRows[0]?.count ?? 0,
  };
}
