import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import { buildYearlyInsights, type YearlyDriveInput, type YearlyChargeInput } from "@odovi/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../../messages/en/yearly.json";
import de from "../../../messages/de/yearly.json";

const mocks = vi.hoisted(() => ({
  validateSession: vi.fn(), getVehicles: vi.fn(), getYearlyInsights: vi.fn(), getInsightYears: vi.fn(), getLocale: vi.fn(),
  redirect: vi.fn((url: string): never => { throw new Error(`redirect:${url}`); }),
}));
vi.mock("../../../lib/auth/session", () => ({ validateSession: mocks.validateSession }));
vi.mock("../../../lib/queries", () => ({ getVehicles: mocks.getVehicles }));
vi.mock("../../../lib/yearlyInsights", () => ({ getYearlyInsights: mocks.getYearlyInsights, getInsightYears: mocks.getInsightYears }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next-intl/server", () => ({ getLocale: mocks.getLocale, getTranslations: async () => createTranslator({ locale: await mocks.getLocale(), messages: await mocks.getLocale() === "de" ? de : en }) }));
vi.mock("../../../components/VehicleRequiredState", () => ({ VehicleRequiredState: ({ title }: { title: string }) => <section><h1>{title}</h1><a href="/settings">Set up vehicle</a></section> }));
vi.mock("../../../components/YearlyFilters", () => ({ YearlyFilters: ({ action, year, classification }: { action: string; year: number; classification: string }) => <form action={action} data-yearly-filters><input name="year" defaultValue={year} /><input name="classification" defaultValue={classification} /></form> }));
vi.mock("../../../components/YearlyDestinations", () => ({ YearlyDestinations: () => <section data-yearly-destinations>Destination map and list</section> }));

import WrappedPage from "./page";
import DestinationHeatmapPage from "../places/heatmap/page";

const startTime = Date.UTC(2025, 4, 10, 10);
function drive(overrides: Partial<YearlyDriveInput> = {}): YearlyDriveInput {
  return { id: 31, startTime, endTime: startTime + 3600_000, classification: "private", distanceKm: 42, durationSeconds: 3600, consumedEnergyKwh: 8, energyIsEstimated: false, endPlaceId: 1, endLat: 48.2, endLon: 11.4, endAddress: "Museum", ...overrides };
}
function charge(id: number, cost: string, currency: string | null): YearlyChargeInput {
  return { id, startTime, endTime: startTime + 1800_000, energyAddedKwh: 20, maxPowerKw: 150, chargerType: "dc", cost, currency, placeId: null, address: "Charging site" };
}
function analysis(drives: YearlyDriveInput[] = [], charges: YearlyChargeInput[] = []) {
  return buildYearlyInsights({ drives, charges, places: [{ id: 1, name: "Museum", type: "other", lat: 48.2, lon: 11.4 }], year: 2025, timeZone: "Europe/Berlin", classification: "private", now: Date.UTC(2026, 0, 1) });
}
const params = { year: "2025", classification: "private" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.validateSession.mockResolvedValue({ id: 1 });
  mocks.getVehicles.mockResolvedValue([{ id: 7 }]);
  mocks.getInsightYears.mockResolvedValue([2026, 2025]);
  mocks.getYearlyInsights.mockResolvedValue(analysis());
  mocks.getLocale.mockResolvedValue("en");
});

describe("yearly insight pages", () => {
  for (const [name, page] of [["Wrapped", WrappedPage], ["destination heatmap", DestinationHeatmapPage]] as const) {
    it(`${name} redirects before reading private archive data`, async () => {
      mocks.validateSession.mockResolvedValue(null);
      await expect(page({ searchParams: Promise.resolve(params) })).rejects.toThrow("redirect:/login");
      expect(mocks.getVehicles).not.toHaveBeenCalled();
      expect(mocks.getYearlyInsights).not.toHaveBeenCalled();
      expect(mocks.getInsightYears).not.toHaveBeenCalled();
    });
    it(`${name} handles a missing vehicle without querying its drives`, async () => {
      mocks.getVehicles.mockResolvedValue([]);
      expect(renderToStaticMarkup(await page({ searchParams: Promise.resolve(params) }))).toContain("Set up vehicle");
      expect(mocks.getYearlyInsights).not.toHaveBeenCalled();
    });
    it(`${name} uses the selected year and classification`, async () => {
      const html = renderToStaticMarkup(await page({ searchParams: Promise.resolve(params) }));
      expect(mocks.getYearlyInsights).toHaveBeenCalledWith(7, 2025, "private");
      expect(html).toContain('name="year" value="2025"');
      expect(html).toContain('name="classification" value="private"');
    });
  }

  it("keeps the charging scope visible with no matching drives and includes print context", async () => {
    const html = renderToStaticMarkup(await WrappedPage({ searchParams: Promise.resolve(params) }));
    expect(html).toContain("No completed drives match");
    expect(html).toContain("All completed charging sessions in 2025, independent of the drive classification filter");
    expect(html).toContain("Driving and destinations: 2025 · Private");
    expect(html).toContain("Print / Save as PDF");
    expect(html).toContain("data-wrapped-print");
    expect(html).toContain("data-yearly-destinations");
    expect(html).toContain("Jan");
    expect(html).toContain("Dec");
  });

  it("discloses missing distance in monthly and classification totals", async () => {
    mocks.getYearlyInsights.mockResolvedValue(analysis([drive({ distanceKm: null, consumedEnergyKwh: null, durationSeconds: null })]));
    const html = renderToStaticMarkup(await WrappedPage({ searchParams: Promise.resolve(params) }));
    expect(html).toContain("Values from 0 of 1 drive");
    expect(html.match(/1 distance missing/g)).toHaveLength(2);
    expect(html).toContain("Unavailable");
    expect(html).toContain("1 drive lacks energy data");
  });

  it("renders exact costs by currency and leaves unknown currencies separate", async () => {
    mocks.getYearlyInsights.mockResolvedValue(analysis([drive()], [charge(1, "0.10", "EUR"), charge(2, "0.20", "EUR"), charge(3, "12.00", "CHF"), charge(4, "9007199254740993.01", null)]));
    const html = renderToStaticMarkup(await WrappedPage({ searchParams: Promise.resolve(params) }));
    expect(html).toContain("0.30 EUR");
    expect(html).toContain("12.00 CHF");
    expect(html).toContain("Currency not recorded");
    expect(html).toContain("9,007,199,254,740,993.01");
    expect(html).toContain("Currencies are kept separate");
    expect(html).toContain('href="/drives/31"');
  });

  it("renders German labels and decimal amounts", async () => {
    mocks.getLocale.mockResolvedValue("de");
    mocks.getYearlyInsights.mockResolvedValue(analysis([drive()], [charge(1, "12.30", "EUR")]));
    const html = renderToStaticMarkup(await WrappedPage({ searchParams: Promise.resolve(params) }));
    expect(html).toContain("Drucken / Als PDF speichern");
    expect(html).toContain("Fahrten und Ziele: 2025 · Privat");
    expect(html).toContain("12,30 EUR");
    expect(html).not.toContain("MISSING_MESSAGE");
  });
});
