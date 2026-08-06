import { describe, expect, it } from "vitest";
import type { RoadtripPlanSnapshot } from "@tripatlas/core";
import { buildTeslaWaypoints } from "./waypoints";

describe("buildTeslaWaypoints", () => {
  it("keeps checkpoint order and omits the planned start", () => {
    const plan = {
      stops: [
        { id: "s", label: "Home", lat: 47.1, lon: 8.1, kind: "start" },
        { id: "c", label: "Charge", lat: 46.1234567, lon: 7.7654321, kind: "charge" },
        { id: "d", label: "Lago", lat: 45.9, lon: 8.5, kind: "destination" },
      ],
    } as RoadtripPlanSnapshot;

    expect(buildTeslaWaypoints(plan)).toBe(
      "46.123457,7.765432;45.900000,8.500000",
    );
  });
});
