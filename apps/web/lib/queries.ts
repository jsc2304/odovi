import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import {
  auditLog,
  chargeSessions,
  chargeSessionTags,
  driveTags,
  drives,
  parkSessions,
  places,
  syncState,
  tags,
  vehicles,
} from "@tripatlas/db";
import { db } from "./db";
import { dayBounds } from "./day";

export interface Vehicle {
  id: number;
  displayName: string;
}

/** All vehicles, ordered by id (first = default). */
export async function getVehicles(): Promise<Vehicle[]> {
  return db
    .select({ id: vehicles.id, displayName: vehicles.displayName })
    .from(vehicles)
    .orderBy(asc(vehicles.id));
}

export interface VehicleDetail {
  id: number;
  displayName: string;
  model: string | null;
  vin: string | null;
  efficiencyKwhPerKm: number | null;
  efficiencyOverrideKwhPerKm: number | null;
}

/** All vehicles with the full detail set shown on the settings page. */
export async function getVehiclesDetailed(): Promise<VehicleDetail[]> {
  return db
    .select({
      id: vehicles.id,
      displayName: vehicles.displayName,
      model: vehicles.model,
      vin: vehicles.vin,
      efficiencyKwhPerKm: vehicles.efficiencyKwhPerKm,
      efficiencyOverrideKwhPerKm: vehicles.efficiencyOverrideKwhPerKm,
    })
    .from(vehicles)
    .orderBy(asc(vehicles.id));
}

export interface SyncStateRow {
  source: string;
  entity: string;
  watermarkTs: Date | null;
  lastRunAt: Date | null;
  lastSuccessAt: Date | null;
  lastStatus: string | null;
  lastError: string | null;
  rowsUpserted: number | null;
}

/** All sync_state rows, ordered by source then entity — for the settings page. */
export async function getSyncState(): Promise<SyncStateRow[]> {
  return db
    .select({
      source: syncState.source,
      entity: syncState.entity,
      watermarkTs: syncState.watermarkTs,
      lastRunAt: syncState.lastRunAt,
      lastSuccessAt: syncState.lastSuccessAt,
      lastStatus: syncState.lastStatus,
      lastError: syncState.lastError,
      rowsUpserted: syncState.rowsUpserted,
    })
    .from(syncState)
    .orderBy(asc(syncState.source), asc(syncState.entity));
}

export interface TagLite {
  id: number;
  name: string;
  color: string | null;
}

export interface DriveRow {
  id: number;
  startTime: Date;
  endTime: Date | null;
  distanceKm: number | null;
  durationSeconds: number | null;
  classification: "unclassified" | "private" | "business" | "commute";
  consumedEnergyKwh: number | null;
  avgConsumptionWhKm: number | null;
  energyIsEstimated: boolean;
  startSoc: number | null;
  endSoc: number | null;
  startPlaceName: string | null;
  startAddress: string | null;
  startLat: number | null;
  startLon: number | null;
  endPlaceName: string | null;
  endAddress: string | null;
  endLat: number | null;
  endLon: number | null;
  tags: TagLite[];
}

export interface ParkRow {
  id: number;
  startTime: Date;
  endTime: Date | null;
  placeName: string | null;
  address: string | null;
  lat: number | null;
  lon: number | null;
}

export interface ChargeRow {
  id: number;
  startTime: Date;
  endTime: Date | null;
  placeName: string | null;
  address: string | null;
  lat: number | null;
  lon: number | null;
  energyAddedKwh: number | null;
  durationSeconds: number | null;
  startSoc: number | null;
  endSoc: number | null;
  maxPowerKw: number | null;
  chargerType: "ac" | "dc" | null;
}

export interface DayTimeline {
  drives: DriveRow[];
  parks: ParkRow[];
  charges: ChargeRow[];
}

const startPlaces = places;

/**
 * Fetches all timeline items for one vehicle on one calendar day (APP_TIMEZONE).
 *
 * Drives: start_time within [dayStart, nextDayStart).
 * Parks/charges: same window, but ALSO items that began before dayStart yet run
 * into the day (end_time > dayStart or end_time IS NULL) — clamped for display.
 */
export async function getDayTimeline(
  vehicleId: number,
  date: string,
): Promise<DayTimeline> {
  const { start, end } = dayBounds(date);

  // Drives with joined start/end place names.
  const sp = places;
  const driveRows = await db
    .select({
      id: drives.id,
      startTime: drives.startTime,
      endTime: drives.endTime,
      distanceKm: drives.distanceKm,
      durationSeconds: drives.durationSeconds,
      classification: drives.classification,
      consumedEnergyKwh: drives.consumedEnergyKwh,
      avgConsumptionWhKm: drives.avgConsumptionWhKm,
      energyIsEstimated: drives.energyIsEstimated,
      startSoc: drives.startSoc,
      endSoc: drives.endSoc,
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
    .where(
      and(
        eq(drives.vehicleId, vehicleId),
        gte(drives.startTime, start),
        lt(drives.startTime, end),
      ),
    )
    .orderBy(asc(drives.startTime));

  // Resolve place names for the drives in a single pass.
  const placeIds = new Set<number>();
  for (const d of driveRows) {
    if (d.startPlaceId != null) placeIds.add(d.startPlaceId);
    if (d.endPlaceId != null) placeIds.add(d.endPlaceId);
  }
  const placeNameById = await loadPlaceNames([...placeIds]);
  const tagsByDriveId = await loadTagsForDrives(driveRows.map((d) => d.id));

  const drivesOut: DriveRow[] = driveRows.map((d) => ({
    id: d.id,
    startTime: d.startTime,
    endTime: d.endTime,
    distanceKm: d.distanceKm,
    durationSeconds: d.durationSeconds,
    classification: d.classification,
    consumedEnergyKwh: d.consumedEnergyKwh,
    avgConsumptionWhKm: d.avgConsumptionWhKm,
    energyIsEstimated: d.energyIsEstimated,
    startSoc: d.startSoc,
    endSoc: d.endSoc,
    startPlaceName: d.startPlaceId != null ? placeNameById.get(d.startPlaceId) ?? null : null,
    startAddress: d.startAddress,
    startLat: d.startLat,
    startLon: d.startLon,
    endPlaceName: d.endPlaceId != null ? placeNameById.get(d.endPlaceId) ?? null : null,
    endAddress: d.endAddress,
    endLat: d.endLat,
    endLon: d.endLon,
    tags: tagsByDriveId.get(d.id) ?? [],
  }));

  const parkRows = await db
    .select({
      id: parkSessions.id,
      startTime: parkSessions.startTime,
      endTime: parkSessions.endTime,
      address: parkSessions.address,
      lat: parkSessions.lat,
      lon: parkSessions.lon,
      placeName: sp.name,
    })
    .from(parkSessions)
    .leftJoin(sp, eq(parkSessions.placeId, sp.id))
    .where(
      and(
        eq(parkSessions.vehicleId, vehicleId),
        lt(parkSessions.startTime, end),
        or(gte(parkSessions.endTime, start), isNull(parkSessions.endTime)),
      ),
    )
    .orderBy(asc(parkSessions.startTime));

  const chargeRows = await db
    .select({
      id: chargeSessions.id,
      startTime: chargeSessions.startTime,
      endTime: chargeSessions.endTime,
      address: chargeSessions.address,
      lat: chargeSessions.lat,
      lon: chargeSessions.lon,
      energyAddedKwh: chargeSessions.energyAddedKwh,
      durationSeconds: chargeSessions.durationSeconds,
      startSoc: chargeSessions.startSoc,
      endSoc: chargeSessions.endSoc,
      maxPowerKw: chargeSessions.maxPowerKw,
      chargerType: chargeSessions.chargerType,
      placeName: startPlaces.name,
    })
    .from(chargeSessions)
    .leftJoin(startPlaces, eq(chargeSessions.placeId, startPlaces.id))
    .where(
      and(
        eq(chargeSessions.vehicleId, vehicleId),
        lt(chargeSessions.startTime, end),
        or(gte(chargeSessions.endTime, start), isNull(chargeSessions.endTime)),
      ),
    )
    .orderBy(asc(chargeSessions.startTime));

  return {
    drives: drivesOut,
    parks: parkRows.map((p) => ({
      id: p.id,
      startTime: p.startTime,
      endTime: p.endTime,
      placeName: p.placeName,
      address: p.address,
      lat: p.lat,
      lon: p.lon,
    })),
    charges: chargeRows.map((c) => ({
      id: c.id,
      startTime: c.startTime,
      endTime: c.endTime,
      placeName: c.placeName,
      address: c.address,
      lat: c.lat,
      lon: c.lon,
      energyAddedKwh: c.energyAddedKwh,
      durationSeconds: c.durationSeconds,
      startSoc: c.startSoc,
      endSoc: c.endSoc,
      maxPowerKw: c.maxPowerKw,
      chargerType: c.chargerType,
    })),
  };
}

async function loadPlaceNames(ids: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (ids.length === 0) return map;
  const rows = await db
    .select({ id: places.id, name: places.name })
    .from(places)
    .where(inArray(places.id, ids));
  for (const r of rows) map.set(r.id, r.name);
  return map;
}

/**
 * Loads tags for a set of drives in a single joined query (no N+1), grouped
 * by drive id. Returns an empty map if `driveIds` is empty.
 */
async function loadTagsForDrives(
  driveIds: number[],
): Promise<Map<number, TagLite[]>> {
  const map = new Map<number, TagLite[]>();
  if (driveIds.length === 0) return map;

  const rows = await db
    .select({
      driveId: driveTags.driveId,
      id: tags.id,
      name: tags.name,
      color: tags.color,
    })
    .from(driveTags)
    .innerJoin(tags, eq(driveTags.tagId, tags.id))
    .where(inArray(driveTags.driveId, driveIds))
    .orderBy(asc(tags.name));

  for (const r of rows) {
    const list = map.get(r.driveId) ?? [];
    list.push({ id: r.id, name: r.name, color: r.color });
    map.set(r.driveId, list);
  }
  return map;
}

/** A single drive by id, with resolved place names and assigned tags. */
export async function getDriveById(id: number) {
  const rows = await db.select().from(drives).where(eq(drives.id, id)).limit(1);
  const drive = rows[0];
  if (!drive) return null;

  const ids = [drive.startPlaceId, drive.endPlaceId].filter(
    (v): v is number => v != null,
  );
  const names = await loadPlaceNames(ids);
  const tagsByDriveId = await loadTagsForDrives([id]);
  return {
    ...drive,
    startPlaceName:
      drive.startPlaceId != null ? names.get(drive.startPlaceId) ?? null : null,
    endPlaceName:
      drive.endPlaceId != null ? names.get(drive.endPlaceId) ?? null : null,
    tags: tagsByDriveId.get(id) ?? [],
  };
}

export interface AuditLogRow {
  id: number;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changedAt: Date;
  changedBy: string;
}

/** Audit log entries for one entity, newest first. */
export async function getAuditLogFor(
  entityType: string,
  entityId: number,
): Promise<AuditLogRow[]> {
  const rows = await db
    .select({
      id: auditLog.id,
      field: auditLog.field,
      oldValue: auditLog.oldValue,
      newValue: auditLog.newValue,
      changedAt: auditLog.changedAt,
      changedBy: auditLog.changedBy,
    })
    .from(auditLog)
    .where(
      and(eq(auditLog.entityType, entityType), eq(auditLog.entityId, entityId)),
    )
    .orderBy(desc(auditLog.changedAt));
  return rows;
}

export interface PlaceRow {
  id: number;
  name: string;
  type: "home" | "work" | "customer" | "charger" | "other";
  lat: number;
  lon: number;
  radiusM: number;
  address: string | null;
  driveStartCount: number;
  driveEndCount: number;
  chargeCount: number;
  parkCount: number;
}

/**
 * All places with usage counts (drive start/end, charges, parks), name-sorted.
 * One query using subselects — avoids N+1 and avoids join fan-out between the
 * independently-sized drive/charge/park counts.
 */
export async function getAllPlacesWithUsage(): Promise<PlaceRow[]> {
  const driveStart = db
    .select({
      placeId: drives.startPlaceId,
      driveStartCount: sql<number>`count(*)::int`.as("drive_start_count"),
    })
    .from(drives)
    .where(isNotNull(drives.startPlaceId))
    .groupBy(drives.startPlaceId)
    .as("drive_start");

  const driveEnd = db
    .select({
      placeId: drives.endPlaceId,
      driveEndCount: sql<number>`count(*)::int`.as("drive_end_count"),
    })
    .from(drives)
    .where(isNotNull(drives.endPlaceId))
    .groupBy(drives.endPlaceId)
    .as("drive_end");

  const chargeUsage = db
    .select({
      placeId: chargeSessions.placeId,
      chargeCount: sql<number>`count(*)::int`.as("charge_count"),
    })
    .from(chargeSessions)
    .where(isNotNull(chargeSessions.placeId))
    .groupBy(chargeSessions.placeId)
    .as("charge_usage");

  const parkUsage = db
    .select({
      placeId: parkSessions.placeId,
      parkCount: sql<number>`count(*)::int`.as("park_count"),
    })
    .from(parkSessions)
    .where(isNotNull(parkSessions.placeId))
    .groupBy(parkSessions.placeId)
    .as("park_usage");

  const rows = await db
    .select({
      id: places.id,
      name: places.name,
      type: places.type,
      lat: places.lat,
      lon: places.lon,
      radiusM: places.radiusM,
      address: places.address,
      driveStartCount: sql<number>`coalesce(${driveStart.driveStartCount}, 0)::int`,
      driveEndCount: sql<number>`coalesce(${driveEnd.driveEndCount}, 0)::int`,
      chargeCount: sql<number>`coalesce(${chargeUsage.chargeCount}, 0)::int`,
      parkCount: sql<number>`coalesce(${parkUsage.parkCount}, 0)::int`,
    })
    .from(places)
    .leftJoin(driveStart, eq(driveStart.placeId, places.id))
    .leftJoin(driveEnd, eq(driveEnd.placeId, places.id))
    .leftJoin(chargeUsage, eq(chargeUsage.placeId, places.id))
    .leftJoin(parkUsage, eq(parkUsage.placeId, places.id))
    .orderBy(asc(places.name));

  return rows;
}


/** A single place by id, or null. */
export async function getPlaceById(id: number) {
  const rows = await db.select().from(places).where(eq(places.id, id)).limit(1);
  return rows[0] ?? null;
}

export interface PlaceLite {
  id: number;
  name: string;
  type: "home" | "work" | "customer" | "charger" | "other";
}

/** All places, id+name+type only — for select dropdowns. */
export async function getAllPlacesLite(): Promise<PlaceLite[]> {
  return db
    .select({ id: places.id, name: places.name, type: places.type })
    .from(places)
    .orderBy(asc(places.name));
}

export interface TagWithUsage {
  id: number;
  name: string;
  color: string | null;
  category: string | null;
  driveCount: number;
  chargeCount: number;
}

/** All tags with usage counts (drives + charge sessions), name-sorted. */
export async function getAllTags(): Promise<TagWithUsage[]> {
  const rows = await db
    .select({
      id: tags.id,
      name: tags.name,
      color: tags.color,
      category: tags.category,
      driveCount: sql<number>`count(distinct ${driveTags.driveId})::int`,
      chargeCount: sql<number>`count(distinct ${chargeSessionTags.chargeSessionId})::int`,
    })
    .from(tags)
    .leftJoin(driveTags, eq(driveTags.tagId, tags.id))
    .leftJoin(chargeSessionTags, eq(chargeSessionTags.tagId, tags.id))
    .groupBy(tags.id)
    .orderBy(asc(tags.name));
  return rows;
}

export interface ChargeSessionRow {
  id: number;
  startTime: Date;
  endTime: Date | null;
  placeName: string | null;
  address: string | null;
  lat: number | null;
  lon: number | null;
  startSoc: number | null;
  endSoc: number | null;
  energyAddedKwh: number | null;
  energyUsedKwh: number | null;
  maxPowerKw: number | null;
  avgPowerKw: number | null;
  chargerType: "ac" | "dc" | null;
  durationSeconds: number | null;
  cost: string | null;
  currency: string | null;
}

/** Loads charge tags for a set of charge sessions in one joined query (no N+1). */
async function loadTagsForCharges(
  chargeIds: number[],
): Promise<Map<number, TagLite[]>> {
  const map = new Map<number, TagLite[]>();
  if (chargeIds.length === 0) return map;

  const rows = await db
    .select({
      chargeSessionId: chargeSessionTags.chargeSessionId,
      id: tags.id,
      name: tags.name,
      color: tags.color,
    })
    .from(chargeSessionTags)
    .innerJoin(tags, eq(chargeSessionTags.tagId, tags.id))
    .where(inArray(chargeSessionTags.chargeSessionId, chargeIds))
    .orderBy(asc(tags.name));

  for (const r of rows) {
    const list = map.get(r.chargeSessionId) ?? [];
    list.push({ id: r.id, name: r.name, color: r.color });
    map.set(r.chargeSessionId, list);
  }
  return map;
}

/** All charge sessions for one vehicle within [start, end), newest first. */
export async function getChargeSessionsInRange(
  vehicleId: number,
  start: Date,
  end: Date,
): Promise<ChargeSessionRow[]> {
  const rows = await db
    .select({
      id: chargeSessions.id,
      startTime: chargeSessions.startTime,
      endTime: chargeSessions.endTime,
      address: chargeSessions.address,
      lat: chargeSessions.lat,
      lon: chargeSessions.lon,
      startSoc: chargeSessions.startSoc,
      endSoc: chargeSessions.endSoc,
      energyAddedKwh: chargeSessions.energyAddedKwh,
      energyUsedKwh: chargeSessions.energyUsedKwh,
      maxPowerKw: chargeSessions.maxPowerKw,
      avgPowerKw: chargeSessions.avgPowerKw,
      chargerType: chargeSessions.chargerType,
      durationSeconds: chargeSessions.durationSeconds,
      cost: chargeSessions.cost,
      currency: chargeSessions.currency,
      placeName: places.name,
    })
    .from(chargeSessions)
    .leftJoin(places, eq(chargeSessions.placeId, places.id))
    .where(
      and(
        eq(chargeSessions.vehicleId, vehicleId),
        gte(chargeSessions.startTime, start),
        lt(chargeSessions.startTime, end),
      ),
    )
    .orderBy(desc(chargeSessions.startTime));
  return rows;
}

/** A single charge session by id, with resolved place name and assigned tags. */
export async function getChargeSessionById(id: number) {
  const rows = await db
    .select({
      id: chargeSessions.id,
      vehicleId: chargeSessions.vehicleId,
      startTime: chargeSessions.startTime,
      endTime: chargeSessions.endTime,
      address: chargeSessions.address,
      lat: chargeSessions.lat,
      lon: chargeSessions.lon,
      startSoc: chargeSessions.startSoc,
      endSoc: chargeSessions.endSoc,
      energyAddedKwh: chargeSessions.energyAddedKwh,
      energyUsedKwh: chargeSessions.energyUsedKwh,
      maxPowerKw: chargeSessions.maxPowerKw,
      avgPowerKw: chargeSessions.avgPowerKw,
      chargerType: chargeSessions.chargerType,
      outsideTempAvg: chargeSessions.outsideTempAvg,
      durationSeconds: chargeSessions.durationSeconds,
      cost: chargeSessions.cost,
      currency: chargeSessions.currency,
      notes: chargeSessions.notes,
      placeId: chargeSessions.placeId,
      placeName: places.name,
    })
    .from(chargeSessions)
    .leftJoin(places, eq(chargeSessions.placeId, places.id))
    .where(eq(chargeSessions.id, id))
    .limit(1);
  const charge = rows[0];
  if (!charge) return null;

  const tagsByChargeId = await loadTagsForCharges([id]);
  return { ...charge, tags: tagsByChargeId.get(id) ?? [] };
}
