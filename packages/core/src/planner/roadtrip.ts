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

export interface RoadtripChargePowerBin {
  minSoc: number;
  maxSoc: number;
  powerKw: number;
  sampleCount: number;
}

export interface RoadtripChargeModel {
  fallbackPowerKw: number;
  bins: RoadtripChargePowerBin[];
}

export interface RoadtripChargeStopPlan {
  stopId: string;
  stopIndex: number;
  arrivalSoc: number;
  targetSoc: number;
  energyAddedKwh: number;
  durationSeconds: number;
  effectivePowerKw: number;
}

export const DEFAULT_EFFECTIVE_DC_POWER_KW = 80;

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
  chargeModel?: RoadtripChargeModel;
}

export interface RoadtripTotals {
  distanceKm: number;
  durationSeconds: number;
  energyKwh: number;
  whPerKm: number;
  arrivalSoc: number;
}

export interface RoadtripChargingPlan {
  stops: RoadtripChargeStopPlan[];
  durationSeconds: number;
  energyAddedKwh: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function powerAtSoc(model: RoadtripChargeModel, soc: number): number {
  const matched = model.bins.find(
    (bin) => soc >= bin.minSoc && soc < bin.maxSoc && bin.powerKw > 0,
  );
  return matched?.powerKw ?? Math.max(1, model.fallbackPowerKw);
}

export function estimateChargeStop(params: {
  stopId: string;
  stopIndex: number;
  arrivalSoc: number;
  targetSoc: number;
  capacityKwh: number;
  model?: RoadtripChargeModel;
}): RoadtripChargeStopPlan {
  const model = params.model ?? {
    fallbackPowerKw: DEFAULT_EFFECTIVE_DC_POWER_KW,
    bins: [],
  };
  const fromSoc = clamp(params.arrivalSoc, 0, 100);
  const targetSoc = clamp(params.targetSoc, 0, 100);
  const energyAddedKwh =
    Math.max(0, targetSoc - fromSoc) * (params.capacityKwh / 100);

  let durationSeconds = 0;
  let soc = fromSoc;
  while (soc < targetSoc) {
    const nextSoc = Math.min(targetSoc, Math.floor(soc) + 1);
    const step = Math.max(0, nextSoc - soc);
    const stepEnergyKwh = step * (params.capacityKwh / 100);
    durationSeconds +=
      (stepEnergyKwh / powerAtSoc(model, soc + step / 2)) * 3600;
    soc = nextSoc;
  }
  const effectivePowerKw =
    durationSeconds > 0 ? energyAddedKwh / (durationSeconds / 3600) : 0;

  return {
    stopId: params.stopId,
    stopIndex: params.stopIndex,
    arrivalSoc: params.arrivalSoc,
    targetSoc,
    energyAddedKwh,
    durationSeconds,
    effectivePowerKw,
  };
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
): {
  legs: RoadtripPlanLeg[];
  totals: RoadtripTotals;
  charging: RoadtripChargingPlan;
} {
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
  const chargingStops: RoadtripChargeStopPlan[] = [];

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
    const arrivalStop = input.stops[index + 1]!;
    if (
      arrivalStop.kind === "charge" &&
      arrivalStop.targetSoc != null &&
      index + 1 < input.stops.length - 1
    ) {
      const charge = estimateChargeStop({
        stopId: arrivalStop.id,
        stopIndex: index + 1,
        arrivalSoc,
        targetSoc: arrivalStop.targetSoc,
        capacityKwh: input.capacityKwh,
        model: input.chargeModel,
      });
      chargingStops.push(charge);
      currentSoc = Math.max(arrivalSoc, charge.targetSoc);
    } else {
      currentSoc = arrivalSoc;
    }
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
    charging: {
      stops: chargingStops,
      durationSeconds: chargingStops.reduce(
        (sum, stop) => sum + stop.durationSeconds,
        0,
      ),
      energyAddedKwh: chargingStops.reduce(
        (sum, stop) => sum + stop.energyAddedKwh,
        0,
      ),
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
  /** Added to schema v1 compatibly; older saved snapshots may omit it. */
  charging?: RoadtripChargingPlan;
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
    charging?: {
      source: "history-dc-curve" | "history-dc-average" | "default";
      sessionCount: number;
      fallbackPowerKw: number;
      bins: RoadtripChargePowerBin[];
    };
  };
}
