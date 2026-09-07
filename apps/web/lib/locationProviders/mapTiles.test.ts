import { describe, expect, it, vi } from "vitest";
import {
  LOCATION_PROVIDER_DISCLOSURE_VERSION,
  LocationProviderPolicy,
  type ActiveProviderResolution,
} from "@odovi/core";
import { expandMapTileEndpoint, fetchConfiguredMapTile } from "./mapTiles";

const resolution = new LocationProviderPolicy(
  [
    {
      decisionId: 1,
      capability: "mapTiles",
      mode: "custom",
      provider: "Controlled tiles",
      endpoint: "https://tiles.test/{z}/{x}/{y}.png",
      credentialHeader: "X-Test-Key",
      customContactUrl: "https://tiles.test/policy",
      customOperatingLimits: "Controlled tests only.",
      disclosureVersion: LOCATION_PROVIDER_DISCLOSURE_VERSION,
      decidedAt: "2026-08-26T12:00:00.000Z",
    },
  ],
  { ODOVI_LOCATION_PROVIDER_MAP_TILES_CREDENTIAL: "secret" },
).resolve("mapTiles") as ActiveProviderResolution;

describe("custom map tile adapter", () => {
  it("expands only the requested controlled tile", () => {
    expect(
      expandMapTileEndpoint("https://tiles.test/{z}/{x}/{y}.png", {
        z: 7,
        x: 65,
        y: 42,
      }),
    ).toBe("https://tiles.test/7/65/42.png");
  });

  it("forwards the runtime-only credential and preserves browser caching", async () => {
    const request = vi.fn<typeof fetch>(async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        headers: {
          "content-type": "image/png",
          "cache-control": "public, max-age=3600",
        },
      }),
    );

    const result = await fetchConfiguredMapTile(
      { z: 7, x: 65, y: 42 },
      resolution,
      request as typeof fetch,
    );

    expect(request).toHaveBeenCalledOnce();
    const [url, init] = request.mock.calls[0]!;
    expect(url).toBe("https://tiles.test/7/65/42.png");
    expect((init!.headers as Headers).get("X-Test-Key")).toBe("secret");
    expect(init!.cache).toBe("force-cache");
    expect(result.cacheControl).toBe("public, max-age=3600");
    expect(result.contentType).toBe("image/png");
  });

  it("rejects non-image provider responses", async () => {
    const request = vi.fn(async () =>
      new Response("not a tile", {
        headers: { "content-type": "text/plain" },
      }),
    );

    await expect(
      fetchConfiguredMapTile(
        { z: 1, x: 0, y: 0 },
        resolution,
        request as typeof fetch,
      ),
    ).rejects.toThrow("non-image");
  });
});
