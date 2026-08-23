import { describe, expect, it } from "vitest";
import {
  APP_DESTINATIONS,
  MORE_DESTINATION,
  type MoreGroup,
} from "../components/navigation";

describe("navigation registry", () => {
  it("keeps the mobile bar at five stable destinations", () => {
    const mobile = [
      ...APP_DESTINATIONS.filter((destination) => destination.mobilePrimary),
      MORE_DESTINATION,
    ];

    expect(mobile.map((destination) => destination.id)).toEqual([
      "start",
      "day",
      "search",
      "journeys",
      "settings",
    ]);
  });

  it("exposes every More destination in exactly one intent group", () => {
    const expected: Record<MoreGroup, string[]> = {
      plan: ["calendar", "journeys", "planner"],
      review: ["charges", "insights", "places", "reports"],
      configure: ["rules", "settings", "tags"],
    };

    for (const group of Object.keys(expected) as MoreGroup[]) {
      const ids = APP_DESTINATIONS.filter(
        (destination) => destination.moreGroup === group,
      )
        .map((destination) => destination.id)
        .sort();
      expect(ids).toEqual(expected[group]);
    }
  });
});
