import type { RoadtripPlanSnapshot } from "@tripatlas/core";

/** Tesla starts at the vehicle's current position; all following plan stops are ordered waypoints. */
export function buildTeslaWaypoints(plan: RoadtripPlanSnapshot): string {
  return plan.stops
    .slice(1)
    .map((stop) => `${stop.lat.toFixed(6)},${stop.lon.toFixed(6)}`)
    .join(";");
}
