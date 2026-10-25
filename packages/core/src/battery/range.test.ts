import { describe, expect, it } from "vitest";
import { buildBatteryRangeTrend, type BatteryRangeCharge } from "./range.js";

const now = Date.parse("2026-01-01T00:00:00Z");
function charge(date: string, fullRange = 500, patch: Partial<BatteryRangeCharge> = {}): BatteryRangeCharge {
  const endTime = Date.parse(date);
  return { startTime: endTime - 3600000, endTime, endRatedRangeKm: fullRange * 0.8,
    endSoc: 80, energyAddedKwh: 20, ...patch };
}
const trend = (charges: BatteryRangeCharge[], timeZone = "Europe/Berlin") =>
  buildBatteryRangeTrend(charges, timeZone, now);

describe("BMS rated-range history", () => {
  it("uses independent range / end SoC, month medians and the first recorded month", () => {
    const data = [
      charge("2025-02-04T12:00Z", 480), charge("2025-01-02T12:00Z", 500),
      charge("2025-02-02T12:00Z", 470), charge("2025-01-04T12:00Z", 510),
      charge("2025-01-03T12:00Z", 490), charge("2025-02-03T12:00Z", 460),
    ];
    const result = trend(data);
    expect(result.months).toEqual([
      { month: "2025-01", medianFullRangeKm: 500, sampleCount: 3 },
      { month: "2025-02", medianFullRangeKm: 470, sampleCount: 3 },
    ]);
    expect(result.changeKm).toBe(-30);
    expect(result.changePercent).toBe(-6);
    expect(result.firstDataAt).toBe(Date.parse("2025-01-02T12:00Z"));
    expect(result.lastObservationAt).toBe(Date.parse("2025-02-04T12:00Z"));
    expect(result.completedChargeCount).toBe(6);
    expect(result.rejectedCount).toBe(0);
  });

  it("distinguishes archive start from the first month with usable observations", () => {
    const result = trend([
      charge("2025-01-01T12:00Z", 500, { endRatedRangeKm: null }),
      ...[1, 2, 3].map((day) => charge(`2025-02-0${day}T12:00Z`, 500)),
      ...[1, 2, 3].map((day) => charge(`2025-03-0${day}T12:00Z`, 480)),
    ]);
    expect(result.firstDataAt).toBe(Date.parse("2025-01-01T12:00Z"));
    expect(result.firstObservationAt).toBe(Date.parse("2025-02-01T12:00Z"));
    expect(result.baseline?.month).toBe("2025-02");
    expect(result.latest?.month).toBe("2025-03");
    expect(result.changeKm).toBe(-20);
    expect(result.completedChargeCount).toBe(7);
    expect(result.rejectedCount).toBe(1);
  });

  it("groups month boundaries in the configured timezone including DST", () => {
    const data = [charge("2025-03-31T22:30Z"), charge("2025-10-31T23:30Z")];
    expect(trend(data).months.map((m) => m.month)).toEqual(["2025-04", "2025-11"]);
    expect(trend(data, "America/New_York").months.map((m) => m.month)).toEqual(["2025-03", "2025-10"]);
  });

  it("rejects invalid values and counts missing coverage without inventing estimates", () => {
    const invalid: Partial<BatteryRangeCharge>[] = [
      { endRatedRangeKm: null }, { endRatedRangeKm: 0 }, { endRatedRangeKm: -1 },
      { endRatedRangeKm: Infinity }, { endRatedRangeKm: NaN }, { endRatedRangeKm: Number.MAX_VALUE },
      { endSoc: null }, { endSoc: 0 }, { endSoc: 19 }, { endSoc: 101 }, { endSoc: 20.5 },
      { energyAddedKwh: null }, { energyAddedKwh: 5 }, { energyAddedKwh: -1 },
      { energyAddedKwh: Infinity }, { energyAddedKwh: NaN },
    ];
    const result = trend(invalid.map((patch) => charge("2025-01-01T12:00Z", 500, patch)));
    expect(result.months).toEqual([]);
    expect(result.completedChargeCount).toBe(invalid.length);
    expect(result.rejectedCount).toBe(invalid.length);
    expect(result.baseline).toBeNull();
    expect(result.changePercent).toBeNull();
    expect(result.firstDataAt).not.toBeNull();
    expect(result.lastObservationAt).toBeNull();
  });

  it("accepts inclusive 20–100% SoC and strictly more than 5 kWh", () => {
    const result = trend([
      charge("2025-01-01T12:00Z", 500, { endSoc: 20, endRatedRangeKm: 100, energyAddedKwh: 5.01 }),
      charge("2025-01-02T12:00Z", 600, { endSoc: 100, endRatedRangeKm: 600 }),
    ]);
    expect(result.months[0]).toEqual({ month: "2025-01", medianFullRangeKm: 550, sampleCount: 2 });
  });

  it("excludes open, future and broken spans from completed coverage", () => {
    const result = trend([
      charge("2025-01-01T12:00Z", 500, { endTime: null }),
      charge("2030-01-01T12:00Z"),
      charge("2025-01-01T12:00Z", 500, { startTime: Date.parse("2025-01-01T13:00Z") }),
      charge("2025-01-01T12:00Z", 500, { startTime: NaN }),
    ]);
    expect(result.completedChargeCount).toBe(0);
    expect(result.firstDataAt).toBeNull();
  });

  it("keeps gaps and sparse baseline months; never silently replaces the baseline", () => {
    const result = trend([
      charge("2025-01-01T12:00Z"),
      ...[1, 2, 3].map((day) => charge(`2025-03-0${day}T12:00Z`, 480)),
      ...[1, 2, 3].map((day) => charge(`2025-04-0${day}T12:00Z`, 470)),
    ]);
    expect(result.months.map((m) => m.month)).toEqual(["2025-01", "2025-03", "2025-04"]);
    expect(result.baseline?.sampleCount).toBe(1);
    expect(result.changeKm).toBeNull();
  });

  it("shows no change for a single month or a sparse latest month", () => {
    const january = [1, 2, 3].map((day) => charge(`2025-01-0${day}T12:00Z`));
    expect(trend(january).changeKm).toBeNull();
    expect(trend([...january, charge("2025-02-01T12:00Z")]).changePercent).toBeNull();
    expect(trend([]).observationCount).toBe(0);
  });
});
