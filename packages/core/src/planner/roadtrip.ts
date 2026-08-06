import {
  predictConsumption,
  type ConsumptionBreakdown,
} from "./consumption.js";

export type RoadtripStopKind = "start" | "waypoint" | "charge" | "destination";

export interface RoadtripStop {
  id: string;
  label: string;
  lat: number;
  lon: number;
  kind: RoadtripStopKind;
  targetSoc?: number | null;
}

export interface RoadtripRouteLegInput {
  distanceKm: number;
  durationSeconds: number;
}

export interface RoadtripPlanLeg {
  index: number;
  fromStopId: string;
  toStopId: string;
  distanceKm: number;
  durationSeconds: number;
  avgSpeedKmh: number;
  energyKwh: number;
  whPerKm: number;
  ascentM: number;
  descentM: number;
  startSoc: number;
  arrivalSoc: number;
  breakdown: ConsumptionBreakdown;
}

export interface BuildRoadtripLegsInput {
  stops: RoadtripStop[];
  routeLegs: RoadtripRouteLegInput[];
  startSoc: number;
  capacityKwh: number;
  tempC: number;
  baseWhPerKm: number;
  referenceSpeedKmh: number;
  totalAscentM: number;
  totalDescentM: number;
}

export interface RoadtripTotals {
  distanceKm: number;
  durationSeconds: number;
  energyKwh: number;
  whPerKm: number;
  arrivalSoc: number;
}

/**
 * Turns provider leg distances/durations into deterministic energy and SoC
 * predictions. A multi-coordinate OSRM response does not expose a geometry per
 * leg, so total ascent/descent is allocated by distance. The approximation is
 * explicit in the saved snapshot and can be replaced later without changing
 * the versioned plan contract.
 */
export function buildRoadtripLegs(
  input: BuildRoadtripLegsInput,
): { legs: RoadtripPlanLeg[]; totals: RoadtripTotals } {
  if (input.stops.length < 2) {
    throw new Error("A roadtrip requires at least two stops");
  }
  if (input.routeLegs.length !== input.stops.length - 1) {
    throw new Error("Route legs must match adjacent stops");
  }

  const distanceTotal = input.routeLegs.reduce(
    (sum, leg) => sum + Math.max(0, leg.distanceKm),
    0,
  );
  let currentSoc = input.startSoc;
  let totalEnergyKwh = 0;

  const legs = input.routeLegs.map((routeLeg, index): RoadtripPlanLeg => {
    const distanceKm = Math.max(0, routeLeg.distanceKm);
    const durationSeconds = Math.max(0, routeLeg.durationSeconds);
    const share = distanceTotal > 0 ? distanceKm / distanceTotal : 0;
    const ascentM = input.totalAscentM * share;
    const descentM = input.totalDescentM * share;
    const avgSpeedKmh =
      durationSeconds > 0 ? distanceKm / (durationSeconds / 3600) : 0;
    const prediction = predictConsumption({
      distanceKm,
      avgSpeedKmh,
      tempC: input.tempC,
      ascentM,
      descentM,
      baseWhPerKm: input.baseWhPerKm,
      referenceSpeedKmh: input.referenceSpeedKmh,
    });
    const arrivalSoc =
      currentSoc - (prediction.energyKwh / input.capacityKwh) * 100;
    const leg: RoadtripPlanLeg = {
      index,
      fromStopId: input.stops[index]!.id,
      toStopId: input.stops[index + 1]!.id,
      distanceKm,
      durationSeconds,
      avgSpeedKmh,
      energyKwh: prediction.energyKwh,
      whPerKm: prediction.whPerKm,
      ascentM,
      descentM,
      startSoc: currentSoc,
      arrivalSoc,
      breakdown: prediction.breakdown,
    };
    currentSoc = arrivalSoc;
    totalEnergyKwh += prediction.energyKwh;
    return leg;
  });

  const durationSeconds = input.routeLegs.reduce(
    (sum, leg) => sum + Math.max(0, leg.durationSeconds),
    0,
  );
  return {
    legs,
    totals: {
      distanceKm: distanceTotal,
      durationSeconds,
      energyKwh: totalEnergyKwh,
      whPerKm: distanceTotal > 0 ? (totalEnergyKwh * 1000) / distanceTotal : 0,
      arrivalSoc: currentSoc,
    },
  };
}

export interface RoadtripPlanSnapshot {
  schemaVersion: 1;
  vehicleId: number;
  departureAt: string;
  startSoc: number;
  reserveSoc: number;
  tempC: number;
  capacityKwh: number;
  stops: RoadtripStop[];
  legs: RoadtripPlanLeg[];
  totals: RoadtripTotals;
  geometry: [number, number][];
  assumptions: {
    baseWhPerKm: number;
    baseSource: "temp-bin" | "history-avg" | "vehicle-efficiency" | "default";
    referenceSpeedKmh: number;
    tempBinCenterC: number | null;
    historyDriveCount: number;
    elevationOk: boolean;
    ascentM: number;
    descentM: number;
    elevationAllocation: "distance-proportional";
    routeProvider: "osrm";
    routeProviderIsDefault: boolean;
  };
}
