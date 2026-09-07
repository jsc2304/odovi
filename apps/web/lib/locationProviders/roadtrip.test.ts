import { describe, expect, it, vi } from "vitest";
import {
  LOCATION_PROVIDER_DISCLOSURE_VERSION,
  LocationProviderPolicy,
  createPublicProviderDecision,
  type ProviderDecision,
  type RoadtripStop,
} from "@odovi/core";
import {
  requestRoadtripRoute,
  requestRouteElevations,
} from "./roadtrip";

const stops: RoadtripStop[] = [
  { id: "start", label: "Zurich", lat: 47.3769, lon: 8.5417, kind: "start" },
  {
    id: "destination",
    label: "Bern",
    lat: 46.948,
    lon: 7.4474,
    kind: "destination",
  },
];

const osrmResponse = {
  code: "Ok",
  routes: [
    {
      distance: 123_400,
      duration: 5_400,
      geometry: { coordinates: [[8.5417, 47.3769], [7.4474, 46.948]] },
      legs: [{ distance: 123_400, duration: 5_400 }],
    },
  ],
};

function customDecision(
  capability: "routing" | "elevation",
  endpoint: string,
): ProviderDecision {
  return {
    decisionId: 1,
    capability,
    mode: "custom",
    provider: `Controlled ${capability}`,
    endpoint,
    credentialHeader: "X-Api-Key",
    customContactUrl: "https://operator.example/providers",
    customOperatingLimits: "Controlled by the installation operator.",
    disclosureVersion: LOCATION_PROVIDER_DISCLOSURE_VERSION,
    decidedAt: "2026-08-26T10:00:00.000Z",
  };
}

describe("roadtrip location-provider adapters", () => {
  it("does not contact routing or elevation providers before activation", async () => {
    const controlledFetch = vi.fn();
    const policy = new LocationProviderPolicy([]);

    await expect(
      requestRoadtripRoute(policy, stops, controlledFetch),
    ).resolves.toMatchObject({ status: "disabled" });
    await expect(
      requestRouteElevations(policy, [[8.5417, 47.3769]], controlledFetch),
    ).resolves.toMatchObject({ status: "disabled" });
    expect(controlledFetch).not.toHaveBeenCalled();
  });

  it("uses the disclosed public OSRM request shape only after activation", async () => {
    const controlledFetch = vi.fn<typeof fetch>(async () =>
      Response.json(osrmResponse),
    );
    const policy = new LocationProviderPolicy([
      createPublicProviderDecision("routing", 1, "2026-08-26T10:00:00Z"),
    ]);

    await expect(
      requestRoadtripRoute(policy, stops, controlledFetch),
    ).resolves.toMatchObject({
      status: "ok",
      value: { status: "ok", route: { distanceM: 123_400 } },
      resolution: { mode: "public", provider: "osrm-demo" },
    });
    const [url, init] = controlledFetch.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://router.project-osrm.org/route/v1/driving/8.5417,47.3769;7.4474,46.948?overview=full&geometries=geojson",
    );
    expect(init).toMatchObject({ cache: "no-store", headers: {} });
  });

  it("uses a custom OSRM-compatible endpoint and runtime-only credential", async () => {
    const controlledFetch = vi.fn<typeof fetch>(async () => Response.json(osrmResponse));
    const policy = new LocationProviderPolicy(
      [customDecision("routing", "http://router.internal:5000")],
      { ODOVI_LOCATION_PROVIDER_ROUTING_CREDENTIAL: "controlled-secret" },
    );

    const result = await requestRoadtripRoute(policy, stops, controlledFetch);
    expect(result).toMatchObject({
      status: "ok",
      resolution: { mode: "custom", provider: "Controlled routing" },
    });
    const [url, init] = controlledFetch.mock.calls[0]!;
    expect(String(url)).toContain(
      "http://router.internal:5000/route/v1/driving/8.5417,47.3769;7.4474,46.948",
    );
    expect(init).toMatchObject({
      headers: { "X-Api-Key": "controlled-secret" },
    });
  });

  it("keeps route elevation independent from routing activation", async () => {
    const controlledFetch = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.startsWith("https://router.project-osrm.org")) {
        return Response.json(osrmResponse);
      }
      throw new Error(`unexpected elevation request: ${url}`);
    });
    const policy = new LocationProviderPolicy([
      createPublicProviderDecision("routing", 1, "2026-08-26T10:00:00Z"),
    ]);

    await expect(
      requestRoadtripRoute(policy, stops, controlledFetch),
    ).resolves.toMatchObject({ status: "ok", value: { status: "ok" } });
    await expect(
      requestRouteElevations(policy, [[8.5417, 47.3769]], controlledFetch),
    ).resolves.toMatchObject({ status: "disabled" });
    expect(controlledFetch).toHaveBeenCalledTimes(1);
  });

  it("validates the elevation response and degrades without failing routing", async () => {
    const controlledFetch = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.startsWith("https://router.project-osrm.org")) {
        return Response.json(osrmResponse);
      }
      return Response.json({ elevation: [408] });
    });
    const policy = new LocationProviderPolicy([
      createPublicProviderDecision("routing", 1, "2026-08-26T10:00:00Z"),
      createPublicProviderDecision("elevation", 2, "2026-08-26T10:00:00Z"),
    ]);

    const route = await requestRoadtripRoute(policy, stops, controlledFetch);
    const elevations = await requestRouteElevations(
      policy,
      [[8.5417, 47.3769], [7.4474, 46.948]],
      controlledFetch,
    );
    expect(route).toMatchObject({ status: "ok", value: { status: "ok" } });
    expect(elevations).toMatchObject({
      status: "ok",
      value: { status: "unavailable" },
    });
  });

  it("uses the independent custom elevation endpoint and credential", async () => {
    const controlledFetch = vi.fn<typeof fetch>(async () =>
      Response.json({ elevation: [408, 542] }),
    );
    const policy = new LocationProviderPolicy(
      [
        customDecision(
          "elevation",
          "https://elevation.internal/v1/elevation",
        ),
      ],
      { ODOVI_LOCATION_PROVIDER_ELEVATION_CREDENTIAL: "elevation-secret" },
    );

    await expect(
      requestRouteElevations(
        policy,
        [[8.5417, 47.3769], [7.4474, 46.948]],
        controlledFetch,
      ),
    ).resolves.toMatchObject({
      status: "ok",
      value: { status: "ok", elevations: [408, 542] },
      resolution: { mode: "custom", provider: "Controlled elevation" },
    });
    const [url, init] = controlledFetch.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://elevation.internal/v1/elevation?latitude=47.3769%2C46.948&longitude=8.5417%2C7.4474",
    );
    expect(init).toMatchObject({
      headers: { "X-Api-Key": "elevation-secret" },
    });
  });

  it("turns routing provider outages into a controlled result", async () => {
    const controlledFetch = vi.fn(async () => {
      throw new Error("controlled outage");
    });
    const policy = new LocationProviderPolicy([
      createPublicProviderDecision("routing", 1, "2026-08-26T10:00:00Z"),
    ]);

    await expect(
      requestRoadtripRoute(policy, stops, controlledFetch),
    ).resolves.toMatchObject({
      status: "ok",
      value: { status: "unreachable" },
    });
  });

  it("rejects incomplete custom configuration before any request", async () => {
    const controlledFetch = vi.fn();
    const invalid = {
      ...customDecision("routing", "not-a-url"),
      customOperatingLimits: "",
    };
    const policy = new LocationProviderPolicy([invalid], {
      ODOVI_LOCATION_PROVIDER_ROUTING_CREDENTIAL: "controlled-secret",
    });

    await expect(
      requestRoadtripRoute(policy, stops, controlledFetch),
    ).resolves.toMatchObject({
      status: "disabled",
      resolution: { reason: "invalid-configuration", requiresReview: true },
    });
    expect(controlledFetch).not.toHaveBeenCalled();
  });
});
