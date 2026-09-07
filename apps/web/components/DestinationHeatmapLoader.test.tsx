import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocationProviderClientConfig } from "../lib/locationProviders/clientConfig";
import type { DestinationHeatmapLoaderProps } from "./DestinationHeatmapLoader";

const mocks = vi.hoisted(() => ({ mount: vi.fn(), dynamicOptions: vi.fn() }));
vi.mock("next/dynamic", () => ({
  default: (_load: unknown, options: unknown) => {
    mocks.dynamicOptions(options);
    return function LoadedMap(props: DestinationHeatmapLoaderProps) {
      mocks.mount(props);
      return <div data-testid="mounted-destination-map" />;
    };
  },
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import { DestinationHeatmapLoader } from "./DestinationHeatmapLoader";
import { LocationProviderClientConfigProvider } from "./LocationProviderClientConfig";

const disabled = { status: "disabled", reason: "disabled", requiresReview: false } as const;
const active = {
  status: "active", mode: "custom", provider: "Controlled destination map",
  urlTemplate: "/api/location-providers/map-tiles/{z}/{x}/{y}",
  attribution: { label: "Controlled tiles", href: "https://tiles.test/policy" },
} as const;
const props: DestinationHeatmapLoaderProps = {
  points: [{ key: "office", label: "Office", lat: 47, lon: 8, visits: 12 }],
  ariaLabel: "Destination visit frequency map", emptyLabel: "No mapped destinations",
  visitLabels: { one: "visit", other: "visits" }, intensityLabel: "Stronger color means more visits", locale: "en",
};

function render(mapTiles: LocationProviderClientConfig["mapTiles"]) {
  return renderToStaticMarkup(
    <LocationProviderClientConfigProvider config={{ mapTiles, externalNavigation: disabled }}>
      <DestinationHeatmapLoader {...props} />
      <ol><li>Office · 12 visits</li></ol>
    </LocationProviderClientConfigProvider>,
  );
}

// Existing shared components rely on Next's automatic JSX transform.
beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => mocks.mount.mockClear());

describe("destination heatmap provider boundary", () => {
  it("keeps the map unmounted while providers are disabled and leaves the destination list usable", () => {
    const html = render(disabled);
    expect(html).toContain('data-testid="map-tiles-disabled"');
    expect(html).toContain('href="/settings#provider-review"');
    expect(html).toContain("Office · 12 visits");
    expect(html).not.toContain("mounted-destination-map");
    expect(mocks.mount).not.toHaveBeenCalled();
  });

  it("passes only the active configured provider and retains its attribution", () => {
    const html = render(active);
    expect(mocks.mount).toHaveBeenCalledWith({ ...props, mapTiles: active });
    expect(mocks.dynamicOptions).toHaveBeenCalledWith(expect.objectContaining({ ssr: false }));
    expect(html).toContain('data-testid="map-provider-attribution"');
    expect(html).toContain('href="https://tiles.test/policy"');
    expect(html).toContain("Controlled tiles");
    expect(html).not.toContain("openstreetmap.org");
  });
});
