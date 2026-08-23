import { describe, expect, it } from "vitest";
import type { RoadtripPlanSnapshot } from "./roadtrip.js";
import {
  compareRoadtripPlanToActual,
  type ActualRoadtripDrive,
} from "./planActual.js";

const plan: RoadtripPlanSnapshot = {
  schemaVersion: 1,
  vehicleId: 1,
  departureAt: "2026-08-23T08:00:00.000Z",
  startSoc: 90,
  reserveSoc: 15,
  tempC: 20,
  capacityKwh: 75,
  stops: [
    { id: "zurich", label: "Zürich", lat: 47.3769, lon: 8.5417, kind: "start" },
    { id: "andermatt", label: "Andermatt", lat: 46.635, lon: 8.594, kind: "waypoint" },
    { id: "lake", label: "Lago Maggiore", lat: 46.17, lon: 8.8, kind: "destination" },
  ],
  legs: [
    {
      index: 0,
      fromStopId: "zurich",
      toStopId: "andermatt",
      distanceKm: 110,
      durationSeconds: 5400,
      avgSpeedKmh: 73.3,
      energyKwh: 20,
      whPerKm: 181.8,
      ascentM: 900,
      descentM: 100,
      startSoc: 90,
      arrivalSoc: 63.3,
      breakdown: {
        baseKwh: 18,
        speedAdjustmentKwh: 0,
        ascentKwh: 2.5,
        descentCreditKwh: -0.5,
        referenceSpeedKmh: 70,
        speedFactor: 1,
      },
    },
    {
      index: 1,
      fromStopId: "andermatt",
      toStopId: "lake",
      distanceKm: 90,
      durationSeconds: 4500,
      avgSpeedKmh: 72,
      energyKwh: 16,
      whPerKm: 177.8,
      ascentM: 300,
      descentM: 1100,
      startSoc: 63.3,
      arrivalSoc: 42,
      breakdown: {
        baseKwh: 15,
        speedAdjustmentKwh: 0,
        ascentKwh: 1.5,
        descentCreditKwh: -0.5,
        referenceSpeedKmh: 70,
        speedFactor: 1,
      },
    },
  ],
  totals: {
    distanceKm: 200,
    durationSeconds: 9900,
    energyKwh: 36,
    whPerKm: 180,
    arrivalSoc: 42,
  },
  geometry: [],
  assumptions: {
    baseWhPerKm: 175,
    baseSource: "history-avg",
    referenceSpeedKmh: 70,
    tempBinCenterC: null,
    historyDriveCount: 50,
    elevationOk: true,
    ascentM: 1200,
    descentM: 1200,
    elevationAllocation: "distance-proportional",
    routeProvider: "osrm",
    routeProviderIsDefault: false,
  },
};

function drive(
  id: number,
  overrides: Partial<ActualRoadtripDrive> = {},
): ActualRoadtripDrive {
  return {
    id,
    distanceKm: 100,
    durationSeconds: 5000,
    energyKwh: 18,
    energyIsEstimated: false,
    startSoc: 90,
    endSoc: 65,
    startLat: null,
    startLon: null,
    endLat: null,
    endLon: null,
    ...overrides,
  };
}

describe("compareRoadtripPlanToActual", () => {
  it("compares exact chronological legs and totals", () => {
    const result = compareRoadtripPlanToActual(plan, [
      drive(1, {
        distanceKm: 112,
        durationSeconds: 5700,
        energyKwh: 21,
        startLat: 47.3769,
        startLon: 8.5417,
        endLat: 46.635,
        endLon: 8.594,
        endSoc: 62,
      }),
      drive(2, {
        distanceKm: 92,
        durationSeconds: 4700,
        energyKwh: 17,
        startSoc: 62,
        startLat: 46.635,
        startLon: 8.594,
        endLat: 46.17,
        endLon: 8.8,
        endSoc: 39,
      }),
    ]);

    expect(result.matchedLegCount).toBe(2);
    expect(result.legs.map((leg) => leg.matchConfidence)).toEqual(["high", "high"]);
    expect(result.actual?.distanceKm).toBe(204);
    expect(result.deltas?.distanceKm).toBe(4);
    expect(result.deltas?.arrivalSoc).toBe(-3);
  });

  it("keeps an unplanned break inside the surrounding planned leg", () => {
    const result = compareRoadtripPlanToActual(plan, [
      drive(1, {
        distanceKm: 50,
        startLat: 47.3769,
        startLon: 8.5417,
        endLat: 47.0,
        endLon: 8.55,
      }),
      drive(2, {
        distanceKm: 61,
        startLat: 47.0,
        startLon: 8.55,
        endLat: 46.635,
        endLon: 8.594,
      }),
      drive(3, {
        distanceKm: 91,
        startLat: 46.635,
        startLon: 8.594,
        endLat: 46.17,
        endLon: 8.8,
      }),
    ]);

    expect(result.legs[0]?.actualDriveIds).toEqual([1, 2]);
    expect(result.legs[1]?.actualDriveIds).toEqual([3]);
  });

  it("does not turn incomplete actual data into false zero totals", () => {
    const result = compareRoadtripPlanToActual(plan, [
      drive(1),
      drive(2, { distanceKm: null, energyKwh: null, endSoc: null }),
    ]);

    expect(result.actual?.distanceKm).toBeNull();
    expect(result.actual?.energyKwh).toBeNull();
    expect(result.actual?.arrivalSoc).toBeNull();
    expect(result.deltas?.distanceKm).toBeNull();
    expect(result.coverage.distance).toBe(0.5);
  });

  it("leaves unmatched plan legs visible when telemetry is incomplete", () => {
    const result = compareRoadtripPlanToActual(plan, [
      drive(1, {
        startLat: 46.635,
        startLon: 8.594,
        endLat: 46.17,
        endLon: 8.8,
      }),
    ]);

    expect(result.matchedLegCount).toBe(1);
    expect(result.legs[0]?.actual).toBeNull();
    expect(result.legs[1]?.actualDriveIds).toEqual([1]);
  });
});
