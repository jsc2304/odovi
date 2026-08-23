import "server-only";
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import {
  chargeSessions,
  drives,
  journeyItems,
  journeys,
  places,
  routePoints,
} from "@tripatlas/db";
import type { KpiCharge, KpiDrive } from "@tripatlas/core";
import { db } from "./db";
import type { JourneyType } from "./journeyTypes";

export {
  JOURNEY_TYPE_LABELS,
  JOURNEY_TYPE_OPTIONS,
  type JourneyType,
} from "./journeyTypes";

/** Fenster um den Reisezeitraum, in dem Kandidaten zum Hinzufügen gesucht werden. */
export const CANDIDATE_WINDOW_DAYS = 3;

export interface JourneyListItem {
  id: number;
  name: string;
  type: JourneyType;
  startTime: Date;
  endTime: Date;
  color: string | null;
  description: string | null;
  driveCount: number;
  chargeCount: number;
  totalDistanceKm: number;
}

/**
 * Alle Reisen mit einer kompakten Zusammenfassung (Anzahl aktiver Fahrten und
 * Ladestopps sowie Gesamtkilometer), neueste zuerst. Nur nicht-excluded Items
 * zählen. Ein Join pro Item-Typ, aggregiert im JS um Fan-out zu vermeiden.
 */
export async function getJourneys(): Promise<JourneyListItem[]> {
  const rows = await db
    .select()
    .from(journeys)
    .orderBy(asc(journeys.startTime));

  if (rows.length === 0) return [];

  const journeyIds = rows.map((j) => j.id);

  // Aktive (nicht excluded) Item-Rows aller Reisen laden.
  const items = await db
    .select({
      journeyId: journeyItems.journeyId,
      itemType: journeyItems.itemType,
      itemId: journeyItems.itemId,
    })
    .from(journeyItems)
    .where(
      and(
        inArray(journeyItems.journeyId, journeyIds),
        eq(journeyItems.excluded, false),
      ),
    );

  const driveIds = items.filter((i) => i.itemType === "drive").map((i) => i.itemId);
  const distanceByDriveId = new Map<number, number>();
  if (driveIds.length > 0) {
    const driveRows = await db
      .select({ id: drives.id, distanceKm: drives.distanceKm })
      .from(drives)
      .where(inArray(drives.id, driveIds));
    for (const d of driveRows) distanceByDriveId.set(d.id, d.distanceKm ?? 0);
  }

  const summary = new Map<
    number,
    { driveCount: number; chargeCount: number; totalDistanceKm: number }
  >();
  for (const j of journeyIds) {
    summary.set(j, { driveCount: 0, chargeCount: 0, totalDistanceKm: 0 });
  }
  for (const i of items) {
    const s = summary.get(i.journeyId)!;
    if (i.itemType === "drive") {
      s.driveCount += 1;
      s.totalDistanceKm += distanceByDriveId.get(i.itemId) ?? 0;
    } else if (i.itemType === "charge") {
      s.chargeCount += 1;
    }
  }

  return rows
    .map((j) => {
      const s = summary.get(j.id)!;
      return {
        id: j.id,
        name: j.name,
        type: j.type,
        startTime: j.startTime,
        endTime: j.endTime,
        color: j.color,
        description: j.description,
        driveCount: s.driveCount,
        chargeCount: s.chargeCount,
        totalDistanceKm: s.totalDistanceKm,
      };
    })
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
}

export interface JourneyRecord {
  id: number;
  name: string;
  type: JourneyType;
  startTime: Date;
  endTime: Date;
  color: string | null;
  description: string | null;
}

/** Eine Reise anhand ihrer id, oder null. */
export async function getJourneyById(
  id: number,
): Promise<JourneyRecord | null> {
  const rows = await db
    .select()
    .from(journeys)
    .where(eq(journeys.id, id))
    .limit(1);
  const j = rows[0];
  if (!j) return null;
  return {
    id: j.id,
    name: j.name,
    type: j.type,
    startTime: j.startTime,
    endTime: j.endTime,
    color: j.color,
    description: j.description,
  };
}

export interface JourneyDriveItem {
  kind: "drive";
  id: number;
  startTime: Date;
  endTime: Date | null;
  distanceKm: number | null;
  durationSeconds: number | null;
  consumedEnergyKwh: number | null;
  energyIsEstimated: boolean;
  startSoc: number | null;
  endSoc: number | null;
  startLat: number | null;
  startLon: number | null;
  endLat: number | null;
  endLon: number | null;
  ascentM: number | null;
  descentM: number | null;
  startPlaceName: string | null;
  startAddress: string | null;
  endPlaceName: string | null;
  endAddress: string | null;
  assignedBy: string;
  excluded: boolean;
}

export interface JourneyChargeItem {
  kind: "charge";
  id: number;
  startTime: Date;
  endTime: Date | null;
  durationSeconds: number | null;
  energyAddedKwh: number | null;
  startSoc: number | null;
  endSoc: number | null;
  maxPowerKw: number | null;
  chargerType: "ac" | "dc" | null;
  cost: string | null;
  currency: string | null;
  placeName: string | null;
  address: string | null;
  lat: number | null;
  lon: number | null;
  assignedBy: string;
  excluded: boolean;
}

export type JourneyTimelineItem = JourneyDriveItem | JourneyChargeItem;

export interface JourneyDetail {
  journey: JourneyRecord;
  /** Chronologisch verschränkte, aktive (nicht excluded) Fahrten + Ladestopps. */
  items: JourneyTimelineItem[];
  /** Rohdaten für buildJourneyKpis (nur aktive Items). */
  kpiDrives: KpiDrive[];
  kpiCharges: KpiCharge[];
}

/**
 * Lädt eine Reise samt ihrer aktiven (nicht excluded) Fahrten und Ladestopps,
 * chronologisch verschränkt, mit aufgelösten Ortsnamen. Parks bleiben in der
 * Detail-Timeline außen vor (MVP-UI zeigt Fahrten + Ladestopps), werden aber
 * für den Export mitgeführt (siehe autoAssignJourney).
 */
export async function getJourneyDetail(
  id: number,
): Promise<JourneyDetail | null> {
  const journey = await getJourneyById(id);
  if (!journey) return null;

  const memberships = await db
    .select({
      itemType: journeyItems.itemType,
      itemId: journeyItems.itemId,
      assignedBy: journeyItems.assignedBy,
      excluded: journeyItems.excluded,
    })
    .from(journeyItems)
    .where(
      and(eq(journeyItems.journeyId, id), eq(journeyItems.excluded, false)),
    );

  const driveIds = memberships
    .filter((m) => m.itemType === "drive")
    .map((m) => m.itemId);
  const chargeIds = memberships
    .filter((m) => m.itemType === "charge")
    .map((m) => m.itemId);

  const metaByDriveId = new Map<
    number,
    { assignedBy: string; excluded: boolean }
  >();
  for (const m of memberships) {
    if (m.itemType === "drive") {
      metaByDriveId.set(m.itemId, { assignedBy: m.assignedBy, excluded: m.excluded });
    }
  }
  const metaByChargeId = new Map<
    number,
    { assignedBy: string; excluded: boolean }
  >();
  for (const m of memberships) {
    if (m.itemType === "charge") {
      metaByChargeId.set(m.itemId, { assignedBy: m.assignedBy, excluded: m.excluded });
    }
  }

  const driveRows =
    driveIds.length > 0
      ? await db
          .select({
            id: drives.id,
            startTime: drives.startTime,
            endTime: drives.endTime,
            distanceKm: drives.distanceKm,
            durationSeconds: drives.durationSeconds,
            consumedEnergyKwh: drives.consumedEnergyKwh,
            energyIsEstimated: drives.energyIsEstimated,
            startSoc: drives.startSoc,
            endSoc: drives.endSoc,
            startLat: drives.startLat,
            startLon: drives.startLon,
            endLat: drives.endLat,
            endLon: drives.endLon,
            ascentM: drives.ascentM,
            descentM: drives.descentM,
            startPlaceId: drives.startPlaceId,
            startAddress: drives.startAddress,
            endPlaceId: drives.endPlaceId,
            endAddress: drives.endAddress,
          })
          .from(drives)
          .where(inArray(drives.id, driveIds))
      : [];

  const chargeRows =
    chargeIds.length > 0
      ? await db
          .select({
            id: chargeSessions.id,
            startTime: chargeSessions.startTime,
            endTime: chargeSessions.endTime,
            durationSeconds: chargeSessions.durationSeconds,
            energyAddedKwh: chargeSessions.energyAddedKwh,
            startSoc: chargeSessions.startSoc,
            endSoc: chargeSessions.endSoc,
            maxPowerKw: chargeSessions.maxPowerKw,
            chargerType: chargeSessions.chargerType,
            cost: chargeSessions.cost,
            currency: chargeSessions.currency,
            address: chargeSessions.address,
            lat: chargeSessions.lat,
            lon: chargeSessions.lon,
            placeName: places.name,
          })
          .from(chargeSessions)
          .leftJoin(places, eq(chargeSessions.placeId, places.id))
          .where(inArray(chargeSessions.id, chargeIds))
      : [];

  // Ortsnamen für Fahrten in einem Durchlauf auflösen.
  const placeIds = new Set<number>();
  for (const d of driveRows) {
    if (d.startPlaceId != null) placeIds.add(d.startPlaceId);
    if (d.endPlaceId != null) placeIds.add(d.endPlaceId);
  }
  const placeNameById = new Map<number, string>();
  if (placeIds.size > 0) {
    const pn = await db
      .select({ id: places.id, name: places.name })
      .from(places)
      .where(inArray(places.id, [...placeIds]));
    for (const p of pn) placeNameById.set(p.id, p.name);
  }

  const driveItems: JourneyDriveItem[] = driveRows.map((d) => {
    const meta = metaByDriveId.get(d.id)!;
    return {
      kind: "drive",
      id: d.id,
      startTime: d.startTime,
      endTime: d.endTime,
      distanceKm: d.distanceKm,
      durationSeconds: d.durationSeconds,
      consumedEnergyKwh: d.consumedEnergyKwh,
      energyIsEstimated: d.energyIsEstimated,
      startSoc: d.startSoc,
      endSoc: d.endSoc,
      startLat: d.startLat,
      startLon: d.startLon,
      endLat: d.endLat,
      endLon: d.endLon,
      ascentM: d.ascentM,
      descentM: d.descentM,
      startPlaceName:
        d.startPlaceId != null ? placeNameById.get(d.startPlaceId) ?? null : null,
      startAddress: d.startAddress,
      endPlaceName:
        d.endPlaceId != null ? placeNameById.get(d.endPlaceId) ?? null : null,
      endAddress: d.endAddress,
      assignedBy: meta.assignedBy,
      excluded: meta.excluded,
    };
  });

  const chargeItems: JourneyChargeItem[] = chargeRows.map((c) => {
    const meta = metaByChargeId.get(c.id)!;
    return {
      kind: "charge",
      id: c.id,
      startTime: c.startTime,
      endTime: c.endTime,
      durationSeconds: c.durationSeconds,
      energyAddedKwh: c.energyAddedKwh,
      startSoc: c.startSoc,
      endSoc: c.endSoc,
      maxPowerKw: c.maxPowerKw,
      chargerType: c.chargerType,
      cost: c.cost,
      currency: c.currency,
      placeName: c.placeName,
      address: c.address,
      lat: c.lat,
      lon: c.lon,
      assignedBy: meta.assignedBy,
      excluded: meta.excluded,
    };
  });

  const items: JourneyTimelineItem[] = [...driveItems, ...chargeItems].sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime(),
  );

  const kpiDrives: KpiDrive[] = driveItems.map((d) => ({
    startTime: d.startTime,
    distanceKm: d.distanceKm,
    durationSeconds: d.durationSeconds,
    consumedEnergyKwh: d.consumedEnergyKwh,
    energyIsEstimated: d.energyIsEstimated,
    startSoc: d.startSoc,
    endSoc: d.endSoc,
    ascentM: d.ascentM,
    descentM: d.descentM,
  }));
  const kpiCharges: KpiCharge[] = chargeItems.map((c) => ({
    startTime: c.startTime,
    durationSeconds: c.durationSeconds,
    energyAddedKwh: c.energyAddedKwh,
    cost: c.cost,
  }));

  return { journey, items, kpiDrives, kpiCharges };
}

export interface CandidateItem {
  kind: "drive" | "charge";
  id: number;
  startTime: Date;
  endTime: Date | null;
  distanceKm: number | null;
  label: string; // Kurzbeschreibung (Start → Ziel bzw. Ladeort)
  chargerType: "ac" | "dc" | null;
  energyAddedKwh: number | null;
  /** true, wenn dieses Item in der Reise als excluded markiert ist (zuvor entfernt). */
  excluded: boolean;
}

/**
 * Kandidaten zum Hinzufügen: Fahrten und Ladestopps, deren Startzeit im Fenster
 * [startTime - N Tage, endTime + N Tage] liegt und die NICHT bereits aktiv in
 * der Reise sind. Bereits als excluded markierte Items erscheinen ebenfalls
 * (markiert), damit der Nutzer sie erneut aufnehmen kann.
 */
export async function getJourneyCandidates(
  id: number,
): Promise<CandidateItem[]> {
  const t = await getTranslations("journeys");
  const journey = await getJourneyById(id);
  if (!journey) return [];

  const windowMs = CANDIDATE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const from = new Date(journey.startTime.getTime() - windowMs);
  const to = new Date(journey.endTime.getTime() + windowMs);

  // Aktive Mitgliedschaften ausblenden; excluded weiterhin anzeigen (markiert).
  const memberships = await db
    .select({
      itemType: journeyItems.itemType,
      itemId: journeyItems.itemId,
      excluded: journeyItems.excluded,
    })
    .from(journeyItems)
    .where(eq(journeyItems.journeyId, id));

  const activeDriveIds = new Set(
    memberships
      .filter((m) => m.itemType === "drive" && !m.excluded)
      .map((m) => m.itemId),
  );
  const activeChargeIds = new Set(
    memberships
      .filter((m) => m.itemType === "charge" && !m.excluded)
      .map((m) => m.itemId),
  );
  const excludedDriveIds = new Set(
    memberships
      .filter((m) => m.itemType === "drive" && m.excluded)
      .map((m) => m.itemId),
  );
  const excludedChargeIds = new Set(
    memberships
      .filter((m) => m.itemType === "charge" && m.excluded)
      .map((m) => m.itemId),
  );

  const driveRows = await db
    .select({
      id: drives.id,
      startTime: drives.startTime,
      endTime: drives.endTime,
      distanceKm: drives.distanceKm,
      startAddress: drives.startAddress,
      endAddress: drives.endAddress,
      startPlaceId: drives.startPlaceId,
      endPlaceId: drives.endPlaceId,
    })
    .from(drives)
    .where(and(gte(drives.startTime, from), lt(drives.startTime, to)))
    .orderBy(asc(drives.startTime));

  const chargeRows = await db
    .select({
      id: chargeSessions.id,
      startTime: chargeSessions.startTime,
      endTime: chargeSessions.endTime,
      chargerType: chargeSessions.chargerType,
      energyAddedKwh: chargeSessions.energyAddedKwh,
      address: chargeSessions.address,
      placeName: places.name,
    })
    .from(chargeSessions)
    .leftJoin(places, eq(chargeSessions.placeId, places.id))
    .where(
      and(gte(chargeSessions.startTime, from), lt(chargeSessions.startTime, to)),
    )
    .orderBy(asc(chargeSessions.startTime));

  const placeIds = new Set<number>();
  for (const d of driveRows) {
    if (d.startPlaceId != null) placeIds.add(d.startPlaceId);
    if (d.endPlaceId != null) placeIds.add(d.endPlaceId);
  }
  const placeNameById = new Map<number, string>();
  if (placeIds.size > 0) {
    const pn = await db
      .select({ id: places.id, name: places.name })
      .from(places)
      .where(inArray(places.id, [...placeIds]));
    for (const p of pn) placeNameById.set(p.id, p.name);
  }

  const candidates: CandidateItem[] = [];

  for (const d of driveRows) {
    if (activeDriveIds.has(d.id)) continue;
    const startLabel =
      (d.startPlaceId != null ? placeNameById.get(d.startPlaceId) : null) ??
      d.startAddress ??
      "?";
    const endLabel =
      (d.endPlaceId != null ? placeNameById.get(d.endPlaceId) : null) ??
      d.endAddress ??
      "?";
    candidates.push({
      kind: "drive",
      id: d.id,
      startTime: d.startTime,
      endTime: d.endTime,
      distanceKm: d.distanceKm,
      label: `${startLabel} → ${endLabel}`,
      chargerType: null,
      energyAddedKwh: null,
      excluded: excludedDriveIds.has(d.id),
    });
  }

  for (const c of chargeRows) {
    if (activeChargeIds.has(c.id)) continue;
    candidates.push({
      kind: "charge",
      id: c.id,
      startTime: c.startTime,
      endTime: c.endTime,
      distanceKm: null,
      label: c.placeName ?? c.address ?? t("chargingSession"),
      chargerType: c.chargerType,
      energyAddedKwh: c.energyAddedKwh,
      excluded: excludedChargeIds.has(c.id),
    });
  }

  candidates.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  return candidates;
}

export interface JourneyRouteTrack {
  driveId: number;
  /** [lat, lon] tuples, ordered by ts, thinned to at most MAX_JOURNEY_TRACK_POINTS. */
  points: [number, number][];
}

// JourneyMap draws every drive of a (potentially multi-day) journey at once —
// keep the per-drive payload lean for transfer/DOM (mirrors lib/dashboard.ts
// getRecentDriveTracks; the full-resolution track lives in lib/driveRoute.ts
// resp. lib/exports/gpx.ts for the single-drive/journey GPX download).
const MAX_JOURNEY_TRACK_POINTS = 300;

/**
 * Route points for a set of drives (JourneyMap overview), thinned
 * server-side to at most MAX_JOURNEY_TRACK_POINTS per drive. One query for
 * all drives, grouped in TS to avoid N+1 round-trips.
 */
export async function getJourneyRouteTracks(driveIds: number[]): Promise<JourneyRouteTrack[]> {
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

  const tracks: JourneyRouteTrack[] = [];
  for (const [driveId, pts] of byDrive) {
    const thinned = thinJourneyPoints(pts, MAX_JOURNEY_TRACK_POINTS);
    tracks.push({ driveId, points: thinned.map((p) => [p.lat, p.lon]) });
  }
  return tracks;
}

/** Keep every nth row so the result has at most `max` entries, always
 * including the first and last point (mirrors lib/driveRoute.ts thin()). */
function thinJourneyPoints<T>(rows: T[], max: number): T[] {
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
