import { haversineDistanceM } from "../places/match.js";
import type {
  RoadtripPlanLeg,
  RoadtripPlanSnapshot,
  RoadtripStop,
} from "./roadtrip.js";

export interface ActualRoadtripDrive {
  id: number;
  distanceKm: number | null;
  durationSeconds: number | null;
  energyKwh: number | null;
  energyIsEstimated: boolean;
  startSoc: number | null;
  endSoc: number | null;
  startLat: number | null;
  startLon: number | null;
  endLat: number | null;
  endLon: number | null;
}

export interface RoadtripComparisonMetrics {
  distanceKm: number | null;
  durationSeconds: number | null;
  energyKwh: number | null;
  whPerKm: number | null;
  startSoc: number | null;
  arrivalSoc: number | null;
}

export interface RoadtripComparisonDeltas {
  distanceKm: number | null;
  durationSeconds: number | null;
  energyKwh: number | null;
  whPerKm: number | null;
  arrivalSoc: number | null;
}

export type RoadtripMatchConfidence = "high" | "medium" | "low";

export interface RoadtripLegComparison {
  index: number;
  from: RoadtripStop;
  to: RoadtripStop;
  planned: RoadtripComparisonMetrics;
  actual: RoadtripComparisonMetrics | null;
  deltas: RoadtripComparisonDeltas | null;
  actualDriveIds: number[];
  matchConfidence: RoadtripMatchConfidence | null;
  /** Furthest matched boundary from its planned checkpoint. */
  boundaryDistanceKm: number | null;
  energyIsEstimated: boolean;
}

export interface RoadtripPlanActualComparison {
  planned: RoadtripComparisonMetrics;
  actual: RoadtripComparisonMetrics | null;
  deltas: RoadtripComparisonDeltas | null;
  legs: RoadtripLegComparison[];
  actualDriveCount: number;
  matchedLegCount: number;
  energyIsEstimated: boolean;
  coverage: {
    distance: number;
    duration: number;
    energy: number;
    arrivalSoc: number;
  };
}

interface Coordinate {
  lat: number;
  lon: number;
}

function coordinate(lat: number | null, lon: number | null): Coordinate | null {
  return lat != null && lon != null ? { lat, lon } : null;
}

function distanceKm(a: Coordinate, b: Coordinate): number {
  return haversineDistanceM(a.lat, a.lon, b.lat, b.lon) / 1000;
}

function sumComplete(values: Array<number | null>): number | null {
  if (values.length === 0 || values.some((value) => value == null)) return null;
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function coverage(values: Array<number | null>): number {
  if (values.length === 0) return 0;
  return values.filter((value) => value != null).length / values.length;
}

function summarizeActual(
  drives: ActualRoadtripDrive[],
): RoadtripComparisonMetrics | null {
  if (drives.length === 0) return null;
  const distance = sumComplete(drives.map((drive) => drive.distanceKm));
  const energy = sumComplete(drives.map((drive) => drive.energyKwh));
  const whPerKm =
    distance != null && distance > 0 && energy != null
      ? (energy * 1000) / distance
      : null;

  return {
    distanceKm: distance,
    durationSeconds: sumComplete(
      drives.map((drive) => drive.durationSeconds),
    ),
    energyKwh: energy,
    whPerKm,
    startSoc: drives[0]?.startSoc ?? null,
    arrivalSoc: drives.at(-1)?.endSoc ?? null,
  };
}

function plannedLegMetrics(leg: RoadtripPlanLeg): RoadtripComparisonMetrics {
  return {
    distanceKm: leg.distanceKm,
    durationSeconds: leg.durationSeconds,
    energyKwh: leg.energyKwh,
    whPerKm: leg.whPerKm,
    startSoc: leg.startSoc,
    arrivalSoc: leg.arrivalSoc,
  };
}

function delta(actual: number | null, planned: number | null): number | null {
  return actual != null && planned != null ? actual - planned : null;
}

function metricDeltas(
  planned: RoadtripComparisonMetrics,
  actual: RoadtripComparisonMetrics,
): RoadtripComparisonDeltas {
  return {
    distanceKm: delta(actual.distanceKm, planned.distanceKm),
    durationSeconds: delta(actual.durationSeconds, planned.durationSeconds),
    energyKwh: delta(actual.energyKwh, planned.energyKwh),
    whPerKm: delta(actual.whPerKm, planned.whPerKm),
    arrivalSoc: delta(actual.arrivalSoc, planned.arrivalSoc),
  };
}

function boundaryDistances(
  from: RoadtripStop,
  to: RoadtripStop,
  drives: ActualRoadtripDrive[],
): number[] {
  const first = drives[0];
  const last = drives.at(-1);
  if (!first || !last) return [];
  const values: number[] = [];
  const actualStart = coordinate(first.startLat, first.startLon);
  const actualEnd = coordinate(last.endLat, last.endLon);
  if (actualStart) {
    values.push(distanceKm(actualStart, { lat: from.lat, lon: from.lon }));
  }
  if (actualEnd) {
    values.push(distanceKm(actualEnd, { lat: to.lat, lon: to.lon }));
  }
  return values;
}

function groupScore(
  plan: RoadtripPlanSnapshot,
  legIndex: number,
  drives: ActualRoadtripDrive[],
): number {
  const from = plan.stops[legIndex]!;
  const to = plan.stops[legIndex + 1]!;
  const boundary = boundaryDistances(from, to, drives);
  const boundaryScore =
    boundary.length > 0
      ? boundary.reduce((sum, value) => sum + value, 0)
      : 60;
  const actualDistance = sumComplete(drives.map((drive) => drive.distanceKm));
  const plannedDistance = plan.legs[legIndex]!.distanceKm;
  const distancePenalty =
    actualDistance != null ? Math.abs(actualDistance - plannedDistance) * 0.2 : 20;
  return boundaryScore + distancePenalty;
}

/**
 * Partitions chronological drives into chronological plan legs. When there are
 * extra drive records (for example an unplanned break), adjacent records can
 * still belong to one planned leg. The optimizer uses checkpoint proximity and
 * distance, while the resulting confidence remains visible to the user.
 */
function groupDrivesByLeg(
  plan: RoadtripPlanSnapshot,
  drives: ActualRoadtripDrive[],
): ActualRoadtripDrive[][] {
  const legCount = plan.legs.length;
  const groups = Array.from({ length: legCount }, () => [] as ActualRoadtripDrive[]);
  if (legCount === 0 || drives.length === 0) return groups;
  if (legCount === 1) return [drives];

  if (drives.length < legCount) {
    let nextLeg = 0;
    drives.forEach((drive, driveIndex) => {
      const lastPossibleLeg = legCount - (drives.length - driveIndex);
      let bestLeg = nextLeg;
      let bestScore = Number.POSITIVE_INFINITY;
      for (let leg = nextLeg; leg <= lastPossibleLeg; leg += 1) {
        const score = groupScore(plan, leg, [drive]);
        if (score < bestScore) {
          bestScore = score;
          bestLeg = leg;
        }
      }
      groups[bestLeg]!.push(drive);
      nextLeg = bestLeg + 1;
    });
    return groups;
  }

  const driveCount = drives.length;
  const costs = Array.from({ length: legCount + 1 }, () =>
    Array<number>(driveCount + 1).fill(Number.POSITIVE_INFINITY),
  );
  const previous = Array.from({ length: legCount + 1 }, () =>
    Array<number>(driveCount + 1).fill(-1),
  );
  costs[0]![0] = 0;

  for (let leg = 1; leg <= legCount; leg += 1) {
    const minEnd = leg;
    const maxEnd = driveCount - (legCount - leg);
    for (let end = minEnd; end <= maxEnd; end += 1) {
      for (let start = leg - 1; start < end; start += 1) {
        const prior = costs[leg - 1]![start]!;
        if (!Number.isFinite(prior)) continue;
        const score = prior + groupScore(plan, leg - 1, drives.slice(start, end));
        if (score < costs[leg]![end]!) {
          costs[leg]![end] = score;
          previous[leg]![end] = start;
        }
      }
    }
  }

  let end = driveCount;
  for (let leg = legCount; leg > 0; leg -= 1) {
    const start = previous[leg]![end]!;
    if (start < 0) return groups;
    groups[leg - 1] = drives.slice(start, end);
    end = start;
  }
  return groups;
}

function matchQuality(
  from: RoadtripStop,
  to: RoadtripStop,
  drives: ActualRoadtripDrive[],
): { confidence: RoadtripMatchConfidence; boundaryDistanceKm: number | null } {
  const distances = boundaryDistances(from, to, drives);
  if (distances.length === 0) {
    return { confidence: "low", boundaryDistanceKm: null };
  }
  const furthest = Math.max(...distances);
  if (distances.length === 2 && furthest <= 10) {
    return { confidence: "high", boundaryDistanceKm: furthest };
  }
  if (furthest <= 30) {
    return { confidence: "medium", boundaryDistanceKm: furthest };
  }
  return { confidence: "low", boundaryDistanceKm: furthest };
}

export function compareRoadtripPlanToActual(
  plan: RoadtripPlanSnapshot,
  actualDrives: ActualRoadtripDrive[],
): RoadtripPlanActualComparison {
  const groups = groupDrivesByLeg(plan, actualDrives);
  const planned: RoadtripComparisonMetrics = {
    distanceKm: plan.totals.distanceKm,
    durationSeconds: plan.totals.durationSeconds,
    energyKwh: plan.totals.energyKwh,
    whPerKm: plan.totals.whPerKm,
    startSoc: plan.startSoc,
    arrivalSoc: plan.totals.arrivalSoc,
  };
  const actual = summarizeActual(actualDrives);

  const legs = plan.legs.map((leg, index): RoadtripLegComparison => {
    const drives = groups[index] ?? [];
    const actualMetrics = summarizeActual(drives);
    const plannedMetrics = plannedLegMetrics(leg);
    const quality =
      drives.length > 0
        ? matchQuality(plan.stops[index]!, plan.stops[index + 1]!, drives)
        : null;
    return {
      index,
      from: plan.stops[index]!,
      to: plan.stops[index + 1]!,
      planned: plannedMetrics,
      actual: actualMetrics,
      deltas: actualMetrics ? metricDeltas(plannedMetrics, actualMetrics) : null,
      actualDriveIds: drives.map((drive) => drive.id),
      matchConfidence: quality?.confidence ?? null,
      boundaryDistanceKm: quality?.boundaryDistanceKm ?? null,
      energyIsEstimated: drives.some((drive) => drive.energyIsEstimated),
    };
  });

  return {
    planned,
    actual,
    deltas: actual ? metricDeltas(planned, actual) : null,
    legs,
    actualDriveCount: actualDrives.length,
    matchedLegCount: legs.filter((leg) => leg.actual != null).length,
    energyIsEstimated: actualDrives.some((drive) => drive.energyIsEstimated),
    coverage: {
      distance: coverage(actualDrives.map((drive) => drive.distanceKm)),
      duration: coverage(actualDrives.map((drive) => drive.durationSeconds)),
      energy: coverage(actualDrives.map((drive) => drive.energyKwh)),
      arrivalSoc: coverage(actualDrives.map((drive) => drive.endSoc)),
    },
  };
}
