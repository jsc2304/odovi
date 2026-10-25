import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import en from "../../messages/en/sinceCharge.json";
import de from "../../messages/de/sinceCharge.json";
import { SinceChargeCard } from "./SinceChargeCard";
import type { SinceChargeStats } from "../../lib/sinceCharge";
const mocks = vi.hoisted(() => ({ locale: "en" }));
vi.mock("next-intl/server", () => ({
  getLocale: async () => mocks.locale,
  getTranslations: async () => createTranslator({ locale: mocks.locale, messages: mocks.locale === "de" ? de : en }),
}));
vi.mock("../../lib/config", () => ({ APP_TIMEZONE: "Europe/Berlin" }));
const ready: SinceChargeStats = { state: "ready", chargeId: 7, chargeEndTime: new Date("2026-01-01T12:00:00Z"),
  driveCount: 0, distanceKm: 0, energyKwh: 0, avgConsumptionWhKm: null, anyEstimated: false,
  hasIncompleteEnergy: false, missingDistanceDriveCount: 0, missingEnergyDriveCount: 0,
  durationSeconds: 0, excludedStraddlingDriveCount: 0 };
const render = async (stats: SinceChargeStats) => renderToStaticMarkup(await SinceChargeCard({ stats }));
describe("since-charge card", () => {
  it("shows a linked charge boundary, zeros, and driving-only scope", async () => {
    const html = await render(ready);
    expect(html).toContain('href="/charges/7"');
    expect(html).toContain("0.0 km");
    expect(html).toContain("0.0 kWh");
    expect(html).toContain("Parking drain is not included");
  });
  it("explains missing and estimated energy and excluded boundary crossings", async () => {
    const html = await render({ ...ready, driveCount: 2, energyKwh: null, anyEstimated: true,
      hasIncompleteEnergy: true, missingDistanceDriveCount: 1, excludedStraddlingDriveCount: 1 });
    expect(html).toContain("includes estimates");
    expect(html).toContain("Energy data is incomplete");
    expect(html).toContain("Distance data is incomplete");
    expect(html).toContain("1 drive crossing");
    expect(html).not.toContain("0.0 kWh");
  });
  it.each(["no-charge", "charging"] as const)("shows %s without invented totals", async (state) => {
    const html = await render({ state });
    expect(html).not.toContain("kWh");
    expect(html).not.toContain('href="/charges/');
  });
  it("has matching namespaces and renders German", async () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
    mocks.locale = "de";
    expect(await render(ready)).toContain("Seit der letzten Ladung");
    mocks.locale = "en";
  });
});
