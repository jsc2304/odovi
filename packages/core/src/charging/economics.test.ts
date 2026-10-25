import { describe, expect, it } from "vitest";
import { summarizeChargingEconomics, type ChargingEconomicsInput } from "./economics.js";

function charge(values: Partial<ChargingEconomicsInput> = {}): ChargingEconomicsInput {
  return { energyAddedKwh: 8, energyUsedKwh: 10, cost: "2.00", currency: "EUR", chargerType: "ac", placeId: null, placeName: null, address: "Home", ...values };
}

describe("charging economics", () => {
  it("returns explicit unavailable ratios for empty and missing data", () => {
    expect(summarizeChargingEconomics([]).total).toMatchObject({ sessionCount: 0, efficiency: null, lossKwh: null, costs: [] });
    const total = summarizeChargingEconomics([charge({ energyAddedKwh: null, energyUsedKwh: null, cost: null })]).total;
    expect(total).toMatchObject({ addedCount: 0, drawnCount: 0, pairedCount: 0, pricedCount: 0, efficiency: null, lossKwh: null });
  });

  it("weights efficiency by the energy of exactly the paired sessions", () => {
    const total = summarizeChargingEconomics([
      charge({ energyAddedKwh: 9, energyUsedKwh: 10 }),
      charge({ energyAddedKwh: 40, energyUsedKwh: 100 }),
      charge({ energyAddedKwh: 20, energyUsedKwh: null }),
      charge({ energyAddedKwh: null, energyUsedKwh: 30 }),
    ]).total;
    expect(total).toMatchObject({ addedKwh: 69, drawnKwh: 140, addedCount: 3, drawnCount: 3, pairedCount: 2, pairedAddedKwh: 49, pairedDrawnKwh: 110, lossKwh: 61 });
    expect(total.efficiency).toBeCloseTo(49 / 110);
  });

  it("retains zero but rejects negative and nonfinite energy, without clamping inconsistent pairs", () => {
    const total = summarizeChargingEconomics([
      charge({ energyAddedKwh: 0, energyUsedKwh: 5 }),
      charge({ energyAddedKwh: 11, energyUsedKwh: 10 }),
      charge({ energyAddedKwh: 0, energyUsedKwh: 0 }),
      charge({ energyAddedKwh: -1, energyUsedKwh: NaN }),
      charge({ energyAddedKwh: Infinity, energyUsedKwh: -3 }),
    ]).total;
    expect(total).toMatchObject({ addedKwh: 11, drawnKwh: 15, addedCount: 3, drawnCount: 3, pairedCount: 1, inconsistentCount: 1, efficiency: 0, lossKwh: 5 });
  });

  it("sums decimal cents exactly and separates normalized, mixed and unknown currencies", () => {
    const total = summarizeChargingEconomics([
      charge({ cost: "0.10", currency: " eur " }), charge({ cost: "0.20" }),
      charge({ cost: "1.23", currency: "CHF" }), charge({ cost: "2.00", currency: null }),
      charge({ cost: "0.10", currency: "EUR/USD" }), charge({ cost: "0.20", currency: "12" }),
    ]).total;
    expect(total.costs.map(({ currency, total, sessionCount }) => ({ currency, total, sessionCount }))).toEqual([
      { currency: "CHF", total: "1.23", sessionCount: 1 },
      { currency: "EUR", total: "0.30", sessionCount: 2 },
      { currency: null, total: "2.30", sessionCount: 3 },
    ]);
    expect(total.costs[2]?.added.perKwh).toBeNull();
  });

  it("uses a different exactly matched cost and energy subset for each denominator", () => {
    const total = summarizeChargingEconomics([
      charge({ cost: "4.00", energyAddedKwh: 20, energyUsedKwh: null }),
      charge({ cost: "10.00", energyAddedKwh: null, energyUsedKwh: 50 }),
      charge({ cost: "0", energyAddedKwh: 10, energyUsedKwh: 20 }),
      charge({ cost: null, energyAddedKwh: 100, energyUsedKwh: 200 }),
      charge({ cost: "8", energyAddedKwh: 0, energyUsedKwh: 0 }),
    ]).total;
    expect(total.costs[0]).toMatchObject({ total: "22.00", sessionCount: 4,
      added: { cost: "4.00", energyKwh: 30, sessionCount: 2 },
      drawn: { cost: "10.00", energyKwh: 70, sessionCount: 2 },
    });
    expect(total.costs[0]?.added.perKwh).toBeCloseTo(4 / 30);
    expect(total.costs[0]?.drawn.perKwh).toBeCloseTo(10 / 70);
    expect(total.pricedCount).toBe(4);
  });

  it("treats free sessions as priced and rejects negative, malformed and sub-cent costs", () => {
    const total = summarizeChargingEconomics(["0.00", "-1", "NaN", "1.001", "", "1e3", null].map((cost) => charge({ cost }))).total;
    expect(total.pricedCount).toBe(1);
    expect(total.costs[0]).toMatchObject({ total: "0.00", added: { perKwh: 0 }, drawn: { perKwh: 0 } });
  });

  it("groups saved places before normalized addresses, keeps unknowns and reconciles both views", () => {
    const sessions = [
      charge({ placeId: 2, placeName: "Home", address: "different" }),
      charge({ placeId: 2, placeName: "Home", chargerType: "dc" }),
      charge({ address: "  Main   Road  ", chargerType: null }),
      charge({ address: "main road" }), charge({ address: " " }), charge({ address: null }),
    ];
    const report = summarizeChargingEconomics(sessions);
    expect(report.locations.map((location) => [location.key, location.summary.sessionCount])).toEqual([
      ["address:main road", 2], ["place:2", 2], ["unknown", 2],
    ]);
    for (const view of [report.sources, report.locations]) {
      for (const key of ["sessionCount", "addedKwh", "drawnKwh", "pairedCount", "pricedCount"] as const) {
        expect(view.reduce((sum, row) => sum + row.summary[key], 0)).toBe(report.total[key]);
      }
      expect(view.reduce((sum, row) => sum + Number(row.summary.costs[0]?.total ?? 0), 0)).toBe(Number(report.total.costs[0]?.total));
    }
  });
});
