import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import { buildYearlyInsights, type YearlyDriveInput } from "@odovi/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../messages/en/yearly.json";
import germanMessages from "../messages/de/yearly.json";

const mocks = vi.hoisted(() => ({ loader: vi.fn(), locale: "en" }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => createTranslator({ locale: mocks.locale, messages: mocks.locale === "de" ? germanMessages : messages }) }));
vi.mock("./DestinationHeatmapLoader", () => ({ DestinationHeatmapLoader: (props: unknown) => { mocks.loader(props); return <div>Map</div>; } }));

import { YearlyDestinations } from "./YearlyDestinations";
import { YearlyFilters } from "./YearlyFilters";

const startTime = Date.UTC(2025, 5, 1);
function drive(id: number, endPlaceId: number | null, endLat: number | null, endLon: number | null): YearlyDriveInput {
  return { id, startTime, endTime: startTime + 60_000, classification: "private", distanceKm: 1, durationSeconds: 60, consumedEnergyKwh: 0.2, energyIsEstimated: false, endPlaceId, endLat, endLon, endAddress: null };
}
function insight(drives: YearlyDriveInput[]) {
  return buildYearlyInsights({ drives, charges: [], places: [{ id: 1, name: "Museum", type: "other", lat: 48.2, lon: 11.4 }, { id: 2, name: "Unmapped saved place", type: "other", lat: null, lon: null }], year: 2025, timeZone: "Europe/Berlin", now: Date.UTC(2026, 0, 1) });
}

beforeEach(() => { vi.clearAllMocks(); mocks.locale = "en"; });

describe("yearly destination presentation", () => {
  it("keeps an empty selection readable without mounting a map", async () => {
    const html = renderToStaticMarkup(await YearlyDestinations({ analysis: insight([]), locale: "en" }));
    expect(html).toContain("No destinations with coordinates for this selection");
    expect(html).toContain("No destinations for this selection");
    expect(mocks.loader).not.toHaveBeenCalled();
  });

  it("passes only mapped destinations and their exact arrival counts to the gated loader", async () => {
    const html = renderToStaticMarkup(await YearlyDestinations({ analysis: insight([drive(1, 1, 48.2, 11.4), drive(2, 1, 48.2, 11.4), drive(3, 2, null, null)]), locale: "en" }));
    expect(mocks.loader.mock.calls[0]?.[0].points).toEqual([{ key: "place:1", label: "Museum", lat: 48.2, lon: 11.4, visits: 2 }]);
    expect(html).toContain('href="/places/1/edit"');
    expect(html).toContain("2 visits");
    expect(html).toContain("Unmapped saved place");
    expect(html).toContain("No map coordinates");
    expect(html).toContain("0.001°");
  });

  it("submits native year and classification filters and retains an older selected year", async () => {
    const html = renderToStaticMarkup(await YearlyFilters({ action: "/wrapped", year: 2024, classification: "business", years: [2026, 2025, 2025] }));
    expect(html).toContain('action="/wrapped"');
    expect(html).toContain('method="get"');
    expect(html).toContain('<option value="2024" selected="">2024</option>');
    expect(html).toContain('<option value="business" selected="">Business</option>');
    expect(html.match(/<option value="2025"/g)).toHaveLength(1);
    expect(html).toContain('name="classification"');
    expect(html).toContain("Unclassified");
  });

  it("keeps German coverage above a thousand accurate with singular missing arrivals", async () => {
    mocks.locale = "de";
    const drives = [...Array.from({ length: 1234 }, (_, index) => drive(index + 1, 1, 48.2, 11.4)), drive(1235, null, null, null)];
    const html = renderToStaticMarkup(await YearlyDestinations({ analysis: insight(drives), locale: "de" }));
    expect(html).toContain("1.234 Ankünfte mit Koordinaten");
    expect(html).toContain("1.234 Ankünfte zu Zielen gruppiert");
    expect(html).toContain("1 Ankunft ohne auswertbares Ziel");
    expect(html).not.toContain("1,234 Ankünfte");
  });
});
