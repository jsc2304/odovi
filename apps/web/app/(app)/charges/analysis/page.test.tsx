import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import { analyzeDcCharges, type DcChargeAnalysis, type DcChargeSessionInput } from "@odovi/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../../../messages/en/charges.json";
import de from "../../../../messages/de/charges.json";

const mocks = vi.hoisted(() => ({
  validateSession: vi.fn(),
  getVehicles: vi.fn(),
  getChargeAnalysis: vi.fn(),
  getLocale: vi.fn(),
  redirect: vi.fn((url: string): never => { throw new Error(`redirect:${url}`); }),
}));

vi.mock("../../../../lib/auth/session", () => ({ validateSession: mocks.validateSession }));
vi.mock("../../../../lib/queries", () => ({ getVehicles: mocks.getVehicles }));
vi.mock("../../../../lib/chargeAnalysis", () => ({ getChargeAnalysis: mocks.getChargeAnalysis }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next-intl/server", () => ({
  getLocale: mocks.getLocale,
  getTranslations: async () => createTranslator({ locale: await mocks.getLocale(), messages: await mocks.getLocale() === "de" ? de : en }),
}));
vi.mock("../../../../components/VehicleRequiredState", () => ({
  VehicleRequiredState: ({ title, subtitle }: { title: string; subtitle: string }) => <section><h1>{title}</h1><p>{subtitle}</p><a href="/settings">Set up vehicle</a></section>,
}));
vi.mock("../../../../components/ui/EmptyState", () => ({
  EmptyState: ({ title, hint }: { title: string; hint: string }) => <div><p>{title}</p><p>{hint}</p></div>,
}));

import ChargeAnalysisPage from "./page";

function session(id: number, overrides: Partial<DcChargeSessionInput> = {}): DcChargeSessionInput {
  const startTime = Date.UTC(2026, 0, 1, 10);
  return {
    id,
    startTime,
    endTime: startTime + 30 * 60_000,
    placeId: 1,
    placeName: "Test charging site",
    address: "Test road",
    maxPowerKw: 150,
    outsideTempAvg: null,
    points: Array.from({ length: 31 }, (_, minute) => ({
      ts: startTime + minute * 60_000,
      soc: 10 + minute * 70 / 30,
      powerKw: 150 - minute * 3,
      outsideTemp: null,
    })),
    ...overrides,
  };
}

async function render(params: { count?: string | string[] } = {}, analysis?: DcChargeAnalysis) {
  if (analysis) mocks.getChargeAnalysis.mockResolvedValue(analysis);
  return renderToStaticMarkup(await ChargeAnalysisPage({ searchParams: Promise.resolve(params) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.validateSession.mockResolvedValue({ id: 1, username: "test" });
  mocks.getVehicles.mockResolvedValue([{ id: 7 }]);
  mocks.getChargeAnalysis.mockResolvedValue(analyzeDcCharges([]));
  mocks.getLocale.mockResolvedValue("en");
});

describe("DC charge analysis page", () => {
  it("redirects before any vehicle or charging query for an anonymous request", async () => {
    mocks.validateSession.mockResolvedValue(null);
    await expect(render()).rejects.toThrow("redirect:/login");
    expect(mocks.getVehicles).not.toHaveBeenCalled();
    expect(mocks.getChargeAnalysis).not.toHaveBeenCalled();
  });

  it("shows the vehicle setup state without querying charging data", async () => {
    mocks.getVehicles.mockResolvedValue([]);
    expect(await render()).toContain("Set up vehicle");
    expect(mocks.getChargeAnalysis).not.toHaveBeenCalled();
  });

  it.each([undefined, "invalid", "500", ["10", "5"]])("defaults invalid or absent count %j to five", async (count) => {
    const html = await render({ count });
    expect(mocks.getChargeAnalysis).toHaveBeenCalledWith(7, 5);
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("No completed DC charging sessions yet.");
    expect(html).not.toContain('role="img"');
  });

  it("preserves the explicit ten-session selector in accessible navigation", async () => {
    const html = await render({ count: "10" });
    expect(mocks.getChargeAnalysis).toHaveBeenCalledWith(7, 10);
    expect(html).toContain('aria-label="Number of sessions"');
    const selectedLink = html.match(/<a[^>]*aria-current="page"[^>]*>/)?.[0];
    expect(selectedLink).toContain('href="/charges/analysis?count=10"');
    expect(html).toContain("Last 10");
  });

  it("retains missing-curve sessions and explains unavailable calculations", async () => {
    const html = await render({}, analyzeDcCharges([session(14, { points: [], maxPowerKw: null })]));
    expect(html).toContain('href="/charges/14"');
    expect(html).toContain("too few usable state-of-charge measurements");
    expect(html).toContain("No usable curve");
    expect(html).not.toContain('role="img"');
    expect(html).not.toContain("Longer than comparable recent sessions");
  });

  it("renders numbered curves with an accessible table of recorded values", async () => {
    const html = await render({}, analyzeDcCharges([session(11)]));
    expect(html).toContain('aria-labelledby="charge-comparison-title"');
    expect(html).toContain('aria-describedby="charge-comparison-description"');
    expect(html).toContain("Charging power by state of charge");
    expect(html).toContain("Recorded curve values");
    expect(html).toContain("All 31 recorded points shown in the chart");
    expect(html).toContain('<th scope="col"');
    expect(html.match(/<tr class="border-b border-neutral-100 last:border-0/g)).toHaveLength(31);
    expect(html).toContain("100% of the session duration");
    expect(html).toContain("Not ranked · fewer than 2 timings");
    expect(html).not.toContain("Longer than comparable recent sessions");
  });

  it("renders German headings, selector labels and unavailable-state copy", async () => {
    mocks.getLocale.mockResolvedValue("de");
    const html = await render({ count: "10" }, analyzeDcCharges([session(11, { points: [] })]));
    expect(html).toContain("DC-Ladeanalyse");
    expect(html).toContain("Anzahl der Ladevorgänge");
    expect(html).toContain("Letzte 10");
    expect(html).toContain("zu wenige auswertbare Messungen");
    expect(html).not.toContain("MISSING_MESSAGE");
  });

  it("explains why unknown locations stay unranked even with multiple timings", async () => {
    const unknown = { placeId: null, placeName: null, address: null };
    const html = await render({}, analyzeDcCharges([session(1, unknown), session(2, unknown)]));
    expect(html).toContain("Not ranked · location unknown");
    expect(html).not.toContain("Not ranked · fewer than 2 timings");
  });

  it("qualifies a slower session without inventing a temperature explanation", async () => {
    const slow = session(4);
    slow.endTime = slow.startTime + 45 * 60_000;
    slow.points = Array.from({ length: 46 }, (_, minute) => ({
      ts: slow.startTime + minute * 60_000,
      soc: 10 + minute * 70 / 45,
      powerKw: 100,
      outsideTemp: null,
    }));
    const html = await render({}, analyzeDcCharges([slow, session(1), session(2), session(3)]));
    expect(html).toContain("15 min longer (50%)");
    expect(html).toContain("3 other complete 10–80% sessions (30 min)");
    expect(html).toContain("not enough peers at similar outside temperatures");
    expect(html).toContain("This comparison does not identify a cause");
    expect(html).not.toContain("These peers have average outside temperatures within 5");
  });
});
