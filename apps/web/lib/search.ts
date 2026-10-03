import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, lt, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  chargeSessions,
  chargeSessionTags,
  driveTags,
  drives,
  places,
  tags,
  vehicles,
} from "@odovi/db";
import { db } from "./db";
import type { Classification } from "@odovi/core";
import type { TagLite } from "./queries";

/** Result-set cap (vision.md §8.3 use case is "find the drive", not "browse everything"). */
export const SEARCH_RESULT_LIMIT = 200;

export type SearchType = "drives" | "charges" | "all";

export interface SearchFilters {
  /** Free-text query. Empty string means "no text filter" (filters can still apply). */
  q: string;
  /** Inclusive local-day bounds (YYYY-MM-DD), already resolved to UTC instants by the caller. */
  from?: Date;
  to?: Date;
  classifications?: Classification[];
  type: SearchType;
}

export interface SearchDriveRow {
  kind: "drive";
  id: number;
  startTime: Date;
  endTime: Date | null;
  distanceKm: number | null;
  classification: Classification;
  startPlaceName: string | null;
  startAddress: string | null;
  endPlaceName: string | null;
  endAddress: string | null;
  tags: TagLite[];
}

export interface SearchChargeRow {
  kind: "charge";
  id: number;
  startTime: Date;
  endTime: Date | null;
  placeName: string | null;
  address: string | null;
  energyAddedKwh: number | null;
  tags: TagLite[];
}

export type SearchResultRow = SearchDriveRow | SearchChargeRow;

export interface SearchResult {
  rows: SearchResultRow[];
  driveCount: number;
  chargeCount: number;
  /** True if either result set was cut off at SEARCH_RESULT_LIMIT. */
  truncated: boolean;
}

/** Loads tags for a set of drives in one joined query, grouped by drive id. */
async function loadTagsForDrives(driveIds: number[]): Promise<Map<number, TagLite[]>> {
  const map = new Map<number, TagLite[]>();
  if (driveIds.length === 0) return map;
  const rows = await db
    .select({ driveId: driveTags.driveId, id: tags.id, name: tags.name, color: tags.color })
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

/** Loads tags for a set of charge sessions in one joined query, grouped by charge id. */
async function loadTagsForCharges(chargeIds: number[]): Promise<Map<number, TagLite[]>> {
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

/** Ids of tags whose name matches `q` (case-insensitive substring). */
async function loadMatchingTagIds(q: string): Promise<number[]> {
  const rows = await db.select({ id: tags.id }).from(tags).where(ilike(tags.name, `%${q}%`));
  return rows.map((r) => r.id);
}

/**
 * Searches drives (vision.md §8.3): matches on start/end place name (join),
 * start/end address snapshot, purpose, customer, project, notes, and
 * assigned tag names. Empty `q` with active filters is a valid filter-only
 * search — text conditions are simply omitted.
 */
export async function searchDrives(
  vehicleId: number,
  filters: SearchFilters,
): Promise<{ rows: SearchDriveRow[]; total: number }> {
  const sp = alias(places, "search_start_place");
  const ep = alias(places, "search_end_place");

  const conditions: SQL[] = [eq(drives.vehicleId, vehicleId)];
  if (filters.from) conditions.push(gte(drives.startTime, filters.from));
  if (filters.to) conditions.push(lt(drives.startTime, filters.to));
  if (filters.classifications && filters.classifications.length > 0) {
    conditions.push(inArray(drives.classification, filters.classifications));
  }

  const q = filters.q.trim();
  if (q !== "") {
    const matchingTagIds = await loadMatchingTagIds(q);
    const textConditions: SQL[] = [
      ilike(sp.name, `%${q}%`),
      ilike(ep.name, `%${q}%`),
      ilike(drives.startAddress, `%${q}%`),
      ilike(drives.endAddress, `%${q}%`),
      ilike(drives.purpose, `%${q}%`),
      ilike(drives.customer, `%${q}%`),
      ilike(drives.project, `%${q}%`),
      ilike(drives.notes, `%${q}%`),
    ];
    if (matchingTagIds.length > 0) {
      // Drives whose id appears in drive_tags for one of the matching tags.
      const taggedDriveIds = db
        .select({ driveId: driveTags.driveId })
        .from(driveTags)
        .where(inArray(driveTags.tagId, matchingTagIds));
      textConditions.push(inArray(drives.id, taggedDriveIds));
    }
    conditions.push(or(...textConditions)!);
  }

  const rows = await db
    .select({
      id: drives.id,
      startTime: drives.startTime,
      endTime: drives.endTime,
      distanceKm: drives.distanceKm,
      classification: drives.classification,
      startPlaceName: sp.name,
      startAddress: drives.startAddress,
      endPlaceName: ep.name,
      endAddress: drives.endAddress,
    })
    .from(drives)
    .leftJoin(sp, eq(drives.startPlaceId, sp.id))
    .leftJoin(ep, eq(drives.endPlaceId, ep.id))
    .where(and(...conditions))
    .orderBy(desc(drives.startTime), desc(drives.id))
    .limit(SEARCH_RESULT_LIMIT + 1);

  const capped = rows.slice(0, SEARCH_RESULT_LIMIT);
  const tagsByDriveId = await loadTagsForDrives(capped.map((r) => r.id));

  return {
    rows: capped.map((r) => ({
      kind: "drive" as const,
      id: r.id,
      startTime: r.startTime,
      endTime: r.endTime,
      distanceKm: r.distanceKm,
      classification: r.classification,
      startPlaceName: r.startPlaceName,
      startAddress: r.startAddress,
      endPlaceName: r.endPlaceName,
      endAddress: r.endAddress,
      tags: tagsByDriveId.get(r.id) ?? [],
    })),
    total: rows.length,
  };
}

/**
 * Searches charge sessions (vision.md §8.3): matches on place name (join),
 * address snapshot, notes, and assigned tag names.
 */
export async function searchCharges(
  vehicleId: number,
  filters: Pick<SearchFilters, "q" | "from" | "to">,
): Promise<{ rows: SearchChargeRow[]; total: number }> {
  const conditions: SQL[] = [eq(chargeSessions.vehicleId, vehicleId)];
  if (filters.from) conditions.push(gte(chargeSessions.startTime, filters.from));
  if (filters.to) conditions.push(lt(chargeSessions.startTime, filters.to));

  const q = filters.q.trim();
  if (q !== "") {
    const matchingTagIds = await loadMatchingTagIds(q);
    const textConditions: SQL[] = [
      ilike(places.name, `%${q}%`),
      ilike(chargeSessions.address, `%${q}%`),
      ilike(chargeSessions.notes, `%${q}%`),
    ];
    if (matchingTagIds.length > 0) {
      const taggedChargeIds = db
        .select({ chargeSessionId: chargeSessionTags.chargeSessionId })
        .from(chargeSessionTags)
        .where(inArray(chargeSessionTags.tagId, matchingTagIds));
      textConditions.push(inArray(chargeSessions.id, taggedChargeIds));
    }
    conditions.push(or(...textConditions)!);
  }

  const rows = await db
    .select({
      id: chargeSessions.id,
      startTime: chargeSessions.startTime,
      endTime: chargeSessions.endTime,
      placeName: places.name,
      address: chargeSessions.address,
      energyAddedKwh: chargeSessions.energyAddedKwh,
    })
    .from(chargeSessions)
    .leftJoin(places, eq(chargeSessions.placeId, places.id))
    .where(and(...conditions))
    .orderBy(desc(chargeSessions.startTime), desc(chargeSessions.id))
    .limit(SEARCH_RESULT_LIMIT + 1);

  const capped = rows.slice(0, SEARCH_RESULT_LIMIT);
  const tagsByChargeId = await loadTagsForCharges(capped.map((r) => r.id));

  return {
    rows: capped.map((r) => ({
      kind: "charge" as const,
      id: r.id,
      startTime: r.startTime,
      endTime: r.endTime,
      placeName: r.placeName,
      address: r.address,
      energyAddedKwh: r.energyAddedKwh,
      tags: tagsByChargeId.get(r.id) ?? [],
    })),
    total: rows.length,
  };
}

/**
 * Runs the combined search for the search page (vision.md §8.3): honors
 * `type` (drives / charges / all), caps each sub-result at
 * SEARCH_RESULT_LIMIT, and merges + sorts by startTime desc for display.
 */
export async function runSearch(
  vehicleId: number,
  filters: SearchFilters,
): Promise<SearchResult> {
  const wantDrives = filters.type === "drives" || filters.type === "all";
  const wantCharges = filters.type === "charges" || filters.type === "all";

  const [driveResult, chargeResult] = await Promise.all([
    wantDrives
      ? searchDrives(vehicleId, filters)
      : Promise.resolve({ rows: [] as SearchDriveRow[], total: 0 }),
    wantCharges
      ? searchCharges(vehicleId, filters)
      : Promise.resolve({ rows: [] as SearchChargeRow[], total: 0 }),
  ]);

  const merged: SearchResultRow[] = [...driveResult.rows, ...chargeResult.rows].sort(
    (a, b) => b.startTime.getTime() - a.startTime.getTime(),
  );
  const rows = merged.slice(0, SEARCH_RESULT_LIMIT);

  return {
    rows,
    driveCount: driveResult.total,
    chargeCount: chargeResult.total,
    truncated:
      driveResult.total > SEARCH_RESULT_LIMIT ||
      chargeResult.total > SEARCH_RESULT_LIMIT ||
      merged.length > SEARCH_RESULT_LIMIT,
  };
}

/** Default vehicle (first by id) — mirrors lib/exports/data.ts's single-vehicle MVP default. */
export async function getDefaultVehicleId(): Promise<number | null> {
  const rows = await db
    .select({ id: vehicles.id })
    .from(vehicles)
    .orderBy(asc(vehicles.id))
    .limit(1);
  return rows[0]?.id ?? null;
}
