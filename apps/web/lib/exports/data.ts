import "server-only";
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { drives, places, routePoints, vehicles } from "@odovi/db";
import { resolvePlaceLabel, type Classification, type ReportDrive, type ReportMeta } from "@odovi/core";
import { db } from "../db";
import { dayBounds } from "../day";
import { APP_TIMEZONE } from "../config";
import { loadTagNamesForDrives } from "./tags";
import type { GpxTrack } from "./gpx";

/**
 * Resolves the export metadata block (vehicle name, timezone, generation
 * timestamp) shared by all report renderers. Defaults to the first vehicle
 * (single-vehicle MVP) unless `vehicleId` is given.
 */
export async function loadMeta(vehicleId?: number): Promise<ReportMeta & { vehicleId: number }> {
  const rows = vehicleId != null
    ? await db
        .select({ id: vehicles.id, displayName: vehicles.displayName })
        .from(vehicles)
        .where(eq(vehicles.id, vehicleId))
        .limit(1)
    : await db
        .select({ id: vehicles.id, displayName: vehicles.displayName })
        .from(vehicles)
        .orderBy(asc(vehicles.id))
        .limit(1);

  const vehicle = rows[0];
  if (!vehicle) {
    const t = await getTranslations("exports");
    throw new Error(t("errors.noVehicle"));
  }

  return {
    vehicleId: vehicle.id,
    vehicleName: vehicle.displayName,
    timeZone: APP_TIMEZONE,
    generatedAt: new Date(),
  };
}

/** Loads place display names for a set of place ids in one query. */
export async function loadPlaceNames(ids: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (ids.length === 0) return map;
  const rows = await db
    .select({ id: places.id, name: places.name })
    .from(places)
    .where(inArray(places.id, ids));
  for (const r of rows) map.set(r.id, r.name);
  return map;
}

type DriveDbRow = typeof drives.$inferSelect;

/** Maps raw `drives` rows to `ReportDrive`, resolving place names + tags. */
async function toReportDrives(rows: DriveDbRow[]): Promise<ReportDrive[]> {
  const placeIds = new Set<number>();
  for (const d of rows) {
    if (d.startPlaceId != null) placeIds.add(d.startPlaceId);
    if (d.endPlaceId != null) placeIds.add(d.endPlaceId);
  }
  const [placeNameById, tagsByDriveId] = await Promise.all([
    loadPlaceNames([...placeIds]),
    loadTagNamesForDrives(rows.map((d) => d.id)),
  ]);

  return rows.map((d) => ({
    id: d.id,
    startTime: d.startTime,
    endTime: d.endTime,
    startPlaceName: d.startPlaceId != null ? placeNameById.get(d.startPlaceId) ?? null : null,
    endPlaceName: d.endPlaceId != null ? placeNameById.get(d.endPlaceId) ?? null : null,
    startAddress: d.startAddress,
    endAddress: d.endAddress,
    startLat: d.startLat,
    startLon: d.startLon,
    endLat: d.endLat,
    endLon: d.endLon,
    startOdometerKm: d.startOdometerKm,
    endOdometerKm: d.endOdometerKm,
    distanceKm: d.distanceKm,
    durationSeconds: d.durationSeconds,
    consumedEnergyKwh: d.consumedEnergyKwh,
    energyIsEstimated: d.energyIsEstimated,
    avgConsumptionWhKm: d.avgConsumptionWhKm,
    classification: d.classification,
    purpose: d.purpose,
    customer: d.customer,
    project: d.project,
    notes: d.notes,
    tags: tagsByDriveId.get(d.id) ?? [],
  }));
}

export interface DriveExportData {
  drive: ReportDrive;
  meta: ReportMeta;
}

/** Loads a single drive (by id) mapped to `ReportDrive`, or null if unknown. */
export async function loadDriveReportData(id: number): Promise<DriveExportData | null> {
  const rows = await db.select().from(drives).where(eq(drives.id, id)).limit(1);
  const row = rows[0];
  if (!row) return null;

  const [reportDrive] = await toReportDrives([row]);
  const meta = await loadMeta(row.vehicleId);
  return { drive: reportDrive!, meta };
}

/**
 * Loads a single drive's full-resolution route (lat/lon/ele/time, no
 * server-side thinning — unlike lib/driveRoute.ts, this is a downloaded file
 * rather than a client-rendered map) as a GPX track. Returns null if the
 * drive is unknown or has no recorded route points.
 */
export async function loadDriveGpxTrack(id: number): Promise<GpxTrack | null> {
  const rows = await db
    .select({
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
    .where(eq(drives.id, id))
    .limit(1);
  const drive = rows[0];
  if (!drive) return null;

  const placeIds = [drive.startPlaceId, drive.endPlaceId].filter(
    (v): v is number => v != null,
  );
  const [placeNameById, points] = await Promise.all([
    loadPlaceNames(placeIds),
    db
      .select({
        lat: routePoints.lat,
        lon: routePoints.lon,
        ele: routePoints.elevationM,
        ts: routePoints.ts,
      })
      .from(routePoints)
      .where(eq(routePoints.driveId, id))
      .orderBy(asc(routePoints.ts)),
  ]);
  if (points.length === 0) return null;

  const name = `${resolvePlaceLabel(
    drive.startPlaceId != null ? placeNameById.get(drive.startPlaceId) ?? null : null,
    drive.startAddress,
    drive.startLat,
    drive.startLon,
  )} → ${resolvePlaceLabel(
    drive.endPlaceId != null ? placeNameById.get(drive.endPlaceId) ?? null : null,
    drive.endAddress,
    drive.endLat,
    drive.endLon,
  )}`;

  return {
    name,
    points: points.map((p) => ({ lat: p.lat, lon: p.lon, ele: p.ele, time: p.ts })),
  };
}

export interface DayExportData {
  drives: ReportDrive[];
  meta: ReportMeta;
}

/** Loads all drives of one calendar day (APP_TIMEZONE) mapped to `ReportDrive`. */
export async function loadDayReportData(date: string, vehicleId?: number): Promise<DayExportData> {
  const { start, end } = dayBounds(date);
  const meta = await loadMeta(vehicleId);

  const rows = await db
    .select()
    .from(drives)
    .where(
      and(
        eq(drives.vehicleId, meta.vehicleId),
        gte(drives.startTime, start),
        lt(drives.startTime, end),
      ),
    )
    .orderBy(asc(drives.startTime));

  return { drives: await toReportDrives(rows), meta };
}

/** [start, end) UTC instants for a YYYY-MM calendar month in APP_TIMEZONE. */
export function monthBounds(month: string): { start: Date; end: Date } {
  const firstOfMonth = `${month}-01`;
  const { start } = dayBounds(firstOfMonth);
  const [y, m] = month.split("-").map(Number);
  const nextMonth = m === 12 ? `${y! + 1}-01` : `${y}-${String(m! + 1).padStart(2, "0")}`;
  const { start: end } = dayBounds(`${nextMonth}-01`);
  return { start, end };
}

export interface MonthExportData {
  drives: ReportDrive[];
  meta: ReportMeta;
}

/**
 * Loads all drives of one calendar month (APP_TIMEZONE), optionally
 * pre-filtered by classification (the pure `buildMonthReport` also accepts a
 * filter — pushing it into SQL here just avoids loading unneeded rows).
 */
export async function loadMonthReportData(
  month: string,
  classifications?: Classification[],
): Promise<MonthExportData> {
  const { start, end } = monthBounds(month);
  const meta = await loadMeta();

  const conditions = [
    eq(drives.vehicleId, meta.vehicleId),
    gte(drives.startTime, start),
    lt(drives.startTime, end),
  ];
  if (classifications != null && classifications.length > 0) {
    conditions.push(inArray(drives.classification, classifications));
  }

  const rows = await db
    .select()
    .from(drives)
    .where(and(...conditions))
    .orderBy(asc(drives.startTime));

  return { drives: await toReportDrives(rows), meta };
}
