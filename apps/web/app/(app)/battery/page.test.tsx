import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import { buildBatteryRangeTrend, type BatteryRangeCharge } from "@odovi/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../../messages/en/battery.json";
import de from "../../../messages/de/battery.json";
const mocks = vi.hoisted(() => ({ session: vi.fn(), vehicles: vi.fn(), trend: vi.fn(), locale: vi.fn() }));
vi.mock("../../../lib/auth/session", () => ({ validateSession: mocks.session }));
vi.mock("../../../lib/queries", () => ({ getVehicles: mocks.vehicles }));
vi.mock("../../../lib/battery", () => ({ getBatteryRangeTrend: mocks.trend }));
vi.mock("../../../lib/config", () => ({ APP_TIMEZONE: "Europe/Berlin" }));
vi.mock("next/navigation", () => ({ redirect: (url: string): never => { throw new Error(`redirect:${url}`); } }));
vi.mock("next-intl/server", () => ({
  getLocale: mocks.locale,
  getTranslations: async () => createTranslator({ locale: await mocks.locale(), messages: await mocks.locale() === "de" ? de : en }),
}));
vi.mock("../../../components/VehicleRequiredState", () => ({ VehicleRequiredState: ({ title }: { title: string }) => <h1>{title} setup</h1> }));
import BatteryPage from "./page";
const build = (charges: BatteryRangeCharge[]) => buildBatteryRangeTrend(charges, "Europe/Berlin", Date.parse("2026-01-01T00:00Z"));
const render = async (vehicle?: string | string[]) => renderToStaticMarkup(await BatteryPage({ searchParams: Promise.resolve({ vehicle }) }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ id: 1 });
  mocks.vehicles.mockResolvedValue([{ id: 7, displayName: "First car" }, { id: 9, displayName: "Second car" }]);
  mocks.trend.mockResolvedValue(build([]));
  mocks.locale.mockResolvedValue("en");
});

describe("battery range page", () => {
  it("redirects before querying archive data for an anonymous request", async () => {
    mocks.session.mockResolvedValue(null);
    await expect(render()).rejects.toThrow("redirect:/login");
    expect(mocks.vehicles).not.toHaveBeenCalled();
    expect(mocks.trend).not.toHaveBeenCalled();
  });
  it("handles an archive without vehicles", async () => {
    mocks.vehicles.mockResolvedValue([]);
    expect(await render()).toContain("setup");
    expect(mocks.trend).not.toHaveBeenCalled();
  });
  it.each([undefined, "invalid", "99", ["7", "9"], "07", "7e0"])("uses the first vehicle for invalid selection %j", async (vehicle) => {
    const html = await render(vehicle);
    expect(mocks.trend).toHaveBeenCalledWith(7);
    expect(html).toContain("No qualifying range observations yet");
    expect(html).not.toContain("<svg");
  });
  it("queries only the selected existing vehicle and retains the selector", async () => {
    const html = await render("9");
    expect(mocks.trend).toHaveBeenCalledWith(9);
    expect(html).toContain('<option value="9" selected="">Second car');
    expect(html).toContain('for="battery-vehicle"');
  });
  it.each(["en", "de"])("renders qualified history, coverage and table in %s", async (locale) => {
    mocks.locale.mockResolvedValue(locale);
    const charges = ["2025-01-01T12:00Z", "2025-03-01T12:00Z"].map((date) => ({
      startTime: Date.parse(date) - 3600000, endTime: Date.parse(date),
      endRatedRangeKm: 400, endSoc: 80, energyAddedKwh: 20,
    }));
    mocks.trend.mockResolvedValue(build(charges));
    const html = await render();
    expect(html).toContain('role="img"');
    expect(html).toContain('scope="col"');
    expect(html).toContain("500 km");
    expect(html).toContain(locale === "en" ? "not the vehicle when new" : "nicht der Neuzustand");
    expect(html).toContain(locale === "en" ? "Changes do not establish physical battery degradation" : "Veränderungen belegen keine physische Batteriedegradation");
    expect(html).toContain(locale === "en" ? "at least 3 observations" : "mindestens 3 Beobachtungen");
    expect(html).toContain(locale === "en" ? "First month with usable range observations" : "Erster Monat mit verwertbaren Reichweitenbeobachtungen");
    expect(html).toContain(locale === "en" ? "The archive may start earlier" : "Das Archiv kann früher beginnen");
    expect(html).not.toMatch(/MISSING_MESSAGE|NaN|Infinity/);
  });
});
