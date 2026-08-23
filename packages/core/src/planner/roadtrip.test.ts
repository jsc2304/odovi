import { describe, expect, it } from "vitest";
import {
  buildRoadtripLegs,
  estimateChargeStop,
  type RoadtripStop,
} from "./roadtrip.js";

const stops: RoadtripStop[] = [
  { id: "start", label: "Home", lat: 47, lon: 8, kind: "start" },
  { id: "via", label: "Lunch", lat: 46.5, lon: 8.5, kind: "waypoint" },
  { id: "destination", label: "Lake", lat: 46, lon: 9, kind: "destination" },
];

describe("buildRoadtripLegs", () => {
  it("builds cumulative SoC predictions for adjacent checkpoints", () => {
    const result = buildRoadtripLegs({
      stops,
      routeLegs: [
        { distanceKm: 100, durationSeconds: 3600 },
        { distanceKm: 50, durationSeconds: 2400 },
      ],
      startSoc: 90,
      capacityKwh: 75,
      tempC: 20,
      baseWhPerKm: 180,
      referenceSpeedKmh: 80,
      totalAscentM: 900,
      totalDescentM: 300,
    });

    expect(result.legs).toHaveLength(2);
    expect(result.legs[0]!.fromStopId).toBe("start");
    expect(result.legs[1]!.toStopId).toBe("destination");
    expect(result.legs[1]!.startSoc).toBeCloseTo(
      result.legs[0]!.arrivalSoc,
    );
    expect(result.totals.distanceKm).toBe(150);
    expect(result.totals.durationSeconds).toBe(6000);
    expect(result.totals.arrivalSoc).toBeCloseTo(
      result.legs[1]!.arrivalSoc,
    );
  });

  it("allocates total elevation by leg distance", () => {
    const result = buildRoadtripLegs({
      stops,
      routeLegs: [
        { distanceKm: 75, durationSeconds: 3600 },
        { distanceKm: 25, durationSeconds: 1200 },
      ],
      startSoc: 80,
      capacityKwh: 75,
      tempC: 15,
      baseWhPerKm: 170,
      referenceSpeedKmh: 70,
      totalAscentM: 1000,
      totalDescentM: 400,
    });

    expect(result.legs[0]!.ascentM).toBeCloseTo(750);
    expect(result.legs[1]!.ascentM).toBeCloseTo(250);
    expect(result.legs[0]!.descentM).toBeCloseTo(300);
  });

  it("rejects a provider response with a mismatched leg count", () => {
    expect(() =>
      buildRoadtripLegs({
        stops,
        routeLegs: [{ distanceKm: 10, durationSeconds: 600 }],
        startSoc: 80,
        capacityKwh: 75,
        tempC: 15,
        baseWhPerKm: 170,
        referenceSpeedKmh: 70,
        totalAscentM: 0,
        totalDescentM: 0,
      }),
    ).toThrow("Route legs must match adjacent stops");
  });

  it("charges to a target before predicting the following leg", () => {
    const chargingStops: RoadtripStop[] = [
      stops[0]!,
      { ...stops[1]!, kind: "charge", targetSoc: 80 },
      stops[2]!,
    ];
    const result = buildRoadtripLegs({
      stops: chargingStops,
      routeLegs: [
        { distanceKm: 100, durationSeconds: 3600 },
        { distanceKm: 80, durationSeconds: 3000 },
      ],
      startSoc: 70,
      capacityKwh: 75,
      tempC: 15,
      baseWhPerKm: 180,
      referenceSpeedKmh: 70,
      totalAscentM: 0,
      totalDescentM: 0,
      chargeModel: { fallbackPowerKw: 100, bins: [] },
    });

    expect(result.charging.stops).toHaveLength(1);
    expect(result.charging.stops[0]?.targetSoc).toBe(80);
    expect(result.charging.stops[0]?.durationSeconds).toBeGreaterThan(0);
    expect(result.legs[1]?.startSoc).toBe(80);
  });

  it("integrates a personal charge curve including taper", () => {
    const charge = estimateChargeStop({
      stopId: "charger",
      stopIndex: 1,
      arrivalSoc: 50,
      targetSoc: 90,
      capacityKwh: 100,
      model: {
        fallbackPowerKw: 80,
        bins: [
          { minSoc: 50, maxSoc: 80, powerKw: 100, sampleCount: 20 },
          { minSoc: 80, maxSoc: 100, powerKw: 50, sampleCount: 20 },
        ],
      },
    });

    expect(charge.energyAddedKwh).toBe(40);
    expect(charge.durationSeconds).toBeCloseTo(1800);
    expect(charge.effectivePowerKw).toBeCloseTo(80);
  });

  it("does not add time or energy when the target is already reached", () => {
    const charge = estimateChargeStop({
      stopId: "charger",
      stopIndex: 1,
      arrivalSoc: 82,
      targetSoc: 80,
      capacityKwh: 75,
    });

    expect(charge.energyAddedKwh).toBe(0);
    expect(charge.durationSeconds).toBe(0);
  });
});
