import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import { summarizeChargingEconomics } from "@odovi/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../../../messages/en/chargingEconomics.json";
import de from "../../../../messages/de/chargingEconomics.json";

const mocks = vi.hoisted(() => ({ validateSession: vi.fn(), getVehicles: vi.fn(), getChargingEconomics: vi.fn(), getLocale: vi.fn() }));
vi.mock("../../../../lib/auth/session", () => ({ validateSession: mocks.validateSession }));
vi.mock("../../../../lib/queries", () => ({ getVehicles: mocks.getVehicles }));
vi.mock("../../../../lib/db", () => ({ db: {} }));
vi.mock("server-only", () => ({}));
vi.mock("../../../../lib/chargingEconomics", async (original) => ({ ...await original<typeof import("../../../../lib/chargingEconomics")>(), getChargingEconomics: mocks.getChargingEconomics }));
vi.mock("next/navigation", () => ({ redirect: (url: string): never => { throw new Error(`redirect:${url}`); } }));
vi.mock("next-intl/server", () => ({
  getLocale: mocks.getLocale,
  getTranslations: async () => createTranslator({ locale: await mocks.getLocale(), messages: await mocks.getLocale() === "de" ? de : en }),
}));
vi.mock("../../../../components/VehicleRequiredState", () => ({ VehicleRequiredState: ({ title }: { title: string }) => <h1>{title}: Set up vehicle</h1> }));
import Page from "./page";
import { parseEconomicsMonth, shiftEconomicsMonth } from "../../../../lib/chargingEconomics";

async function render(params: { month?: string | string[]; vehicle?: string | string[] } = {}) {
  return renderToStaticMarkup(await Page({ searchParams: Promise.resolve(params) }));
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.validateSession.mockResolvedValue({ id: 1 });
  mocks.getVehicles.mockResolvedValue([{ id: 7, displayName: "Family car" }, { id: 8, displayName: "Second car" }]);
  mocks.getChargingEconomics.mockResolvedValue(summarizeChargingEconomics([]));
  mocks.getLocale.mockResolvedValue("en");
});

describe("charging economics page", () => {
  it("authenticates before all archive queries", async () => {
    mocks.validateSession.mockResolvedValue(null);
    await expect(render()).rejects.toThrow("redirect:/login");
    expect(mocks.getVehicles).not.toHaveBeenCalled();
    expect(mocks.getChargingEconomics).not.toHaveBeenCalled();
  });
  it("shows setup without an analytics query when there are no vehicles", async () => {
    mocks.getVehicles.mockResolvedValue([]);
    expect(await render()).toContain("Set up vehicle");
    expect(mocks.getChargingEconomics).not.toHaveBeenCalled();
  });
  it("selects only allowed vehicle IDs and retains month and vehicle in navigation", async () => {
    const html = await render({ vehicle: "8", month: "2025-12" });
    expect(mocks.getChargingEconomics).toHaveBeenCalledWith(8, "2025-12");
    expect(html).toContain('value="8" selected=""');
    expect(html).toContain('method="get"');
    expect(html).toContain('month=2026-01');
    expect(html).toContain('vehicle=8&amp;month=2025-11');
    expect(html).toContain("No completed charging sessions");
    expect(html).toContain("By charging type");
    expect(html).toContain("By location");
  });
  it.each(["999", "8junk", ["8", "7"], "7.0"])("falls back safely for invalid vehicle %j", async (vehicle) => {
    await render({ vehicle, month: "2025-03" });
    expect(mocks.getChargingEconomics).toHaveBeenCalledWith(7, "2025-03");
  });
  it.each([undefined, "bad", "2025-00", "2025-13", "2025-1", ["2025-01"], "1969-12"])("rejects malformed month %j", (month) => {
    expect(parseEconomicsMonth(month)).toMatch(/^\d{4}-\d{2}$/);
    expect(parseEconomicsMonth(month)).not.toBe(month);
  });
  it("keeps calendar month shifts valid across year boundaries", () => {
    expect(shiftEconomicsMonth("2025-12", 1)).toBe("2026-01");
    expect(shiftEconomicsMonth("2025-01", -1)).toBe("2024-12");
    expect(parseEconomicsMonth("2025-03")).toBe("2025-03");
  });
  it.each(["en", "de"])("renders honest localized prices, zero energy and unknown currencies in %s", async (locale) => {
    mocks.getLocale.mockResolvedValue(locale);
    mocks.getChargingEconomics.mockResolvedValue(summarizeChargingEconomics([
      { energyAddedKwh: 12.5, energyUsedKwh: 25, cost: "2.50", currency: "EUR", chargerType: "ac", placeId: 1, placeName: "Garage", address: null },
      { energyAddedKwh: 0, energyUsedKwh: null, cost: "0", currency: null, chargerType: null, placeId: null, placeName: null, address: null },
    ]));
    const html = await render({ month: "2025-03" });
    expect(html).toContain(locale === "de" ? "12,5 kWh" : "12.5 kWh");
    expect(html).toContain(locale === "de" ? "2,50" : "2.50");
    expect(html).toContain(locale === "de" ? "Unbekannte Währung" : "Unknown currency");
    expect(html).toContain("0 kWh");
    expect(html).toContain("Garage");
    expect(html).not.toContain("CHF");
    expect(html).not.toMatch(/NaN|Infinity|chargingEconomics\./);
  });
});
