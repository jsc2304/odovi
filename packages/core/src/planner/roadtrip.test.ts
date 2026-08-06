import { describe, expect, it } from "vitest";
import { buildRoadtripLegs, type RoadtripStop } from "./roadtrip.js";

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
});
