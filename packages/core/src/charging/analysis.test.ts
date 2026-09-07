import { describe, expect, it } from "vitest";
import { analyzeDcCharges, DC_CHARGE_MAX_GAP_MS, type DcChargePoint, type DcChargeSessionInput } from "./analysis.js";

function point(seconds: number, soc: number | null, powerKw: number | null = 100): DcChargePoint {
  return { ts: seconds * 1000, soc, powerKw, outsideTemp: null };
}

function session(id = 1, minutes = 20, overrides: Partial<DcChargeSessionInput> = {}): DcChargeSessionInput {
  return {
    id,
    startTime: 0,
    endTime: minutes * 60_000,
    placeId: 1,
    placeName: "Station A",
    address: "Sample street",
    maxPowerKw: null,
    outsideTempAvg: null,
    points: Array.from({ length: minutes + 1 }, (_, minute) => point(minute * 60, 10 + 70 * minute / minutes)),
    ...overrides,
  };
}

function analyze(points: DcChargePoint[], overrides: Partial<DcChargeSessionInput> = {}) {
  return analyzeDcCharges([session(1, 40, { points, ...overrides })]).sessions[0]!;
}

describe("DC charging 10–80% timing", () => {
  it("interpolates both boundaries from observed samples without extrapolation", () => {
    const result = analyze([point(0, 5), point(60, 20), point(120, 50), point(180, 85)]);
    const expectedSeconds = 120 + 60 * 30 / 35 - 60 * 5 / 15;
    expect(result.tenToEighty.minutes).toBeCloseTo(expectedSeconds / 60, 8);
    expect(result.tenToEighty.reason).toBeNull();
  });

  it("includes time at 10% and stops when 80% is first reached", () => {
    const result = analyze([point(0, 10), point(60, 10), point(120, 45), point(180, 80), point(240, 80)]);
    expect(result.tenToEighty).toEqual({ minutes: 3, reason: null });
  });

  it.each([
    ["starts above 10%", [point(0, 20), point(60, 50), point(120, 80)]],
    ["ends below 80%", [point(0, 10), point(60, 40), point(120, 75)]],
    ["only has falling SoC", [point(0, 80), point(60, 45), point(120, 10)]],
  ])("does not invent a full window when a session %s", (_label, points) => {
    expect(analyze(points as DcChargePoint[]).tenToEighty).toEqual({ minutes: null, reason: "partial-session" });
  });

  it("cannot infer timing or a curve from one sample, but preserves its recorded peak", () => {
    const result = analyze([point(60, 10, 150)]);
    expect(result.tenToEighty).toEqual({ minutes: null, reason: "missing-points" });
    expect(result.curveSegments).toEqual([]);
    expect(result.averagePowerKw).toBeNull();
    expect(result.peakPowerKw).toBe(150);
  });

  it("rejects a sparse two-point window spanning an unobserved gap", () => {
    const result = analyze([point(0, 10), point(1800, 80)]);
    expect(result.tenToEighty).toEqual({ minutes: null, reason: "data-gap" });
    expect(result.curveSegments).toEqual([]);
    expect(result.observedPowerMinutes).toBe(0);
  });

  it("accepts the maximum interval and rejects an interval just beyond it", () => {
    expect(analyze([point(0, 10), point(DC_CHARGE_MAX_GAP_MS / 1000, 80)]).tenToEighty.minutes).toBe(2);
    expect(analyze([point(0, 10), point(DC_CHARGE_MAX_GAP_MS / 1000 + 0.001, 80)]).tenToEighty.reason).toBe("data-gap");
  });

  it("ignores missing data and gaps strictly outside an exact 10–80 window", () => {
    const result = analyze([point(0, 5), point(600, null), point(1200, 10), point(1260, 45), point(1320, 80), point(2400, 90)]);
    expect(result.tenToEighty).toEqual({ minutes: 2, reason: null });
  });

  it("ignores earlier gaps below 10% when later samples bracket the crossing", () => {
    const result = analyze([point(0, 3), point(600, null), point(1200, 5), point(1260, 15), point(1320, 50), point(1380, 85)]);
    expect(result.tenToEighty.reason).toBeNull();
    expect(result.tenToEighty.minutes).toBeCloseTo((1320 + 60 * 30 / 35 - 1230) / 60);
  });

  it("does not bridge a missing SoC measurement inside the window", () => {
    const result = analyze([point(0, 10), point(30, null), point(60, 50), point(120, 80)]);
    expect(result.tenToEighty).toEqual({ minutes: null, reason: "data-gap" });
    expect(result.curveSegments.map((segment) => segment.map((sample) => sample.soc))).toEqual([[50, 80]]);
  });

  it("keeps timing usable when power is missing but SoC observations are complete", () => {
    const result = analyze([point(0, 10, null), point(60, 45, null), point(120, 80, null)]);
    expect(result.tenToEighty).toEqual({ minutes: 2, reason: null });
    expect(result.averagePowerKw).toBeNull();
    expect(result.curveSegments).toEqual([]);
  });

  it("rejects a SoC regression and splits the chart instead of hiding the drop", () => {
    const result = analyze([point(0, 10), point(60, 40), point(120, 39), point(180, 80)]);
    expect(result.tenToEighty).toEqual({ minutes: null, reason: "soc-regression" });
    expect(result.curveSegments.map((segment) => segment.map((sample) => sample.soc))).toEqual([[10, 40], [39, 80]]);
  });

  it("does not restart the timing after a regression below 10%", () => {
    const result = analyze([point(0, 10), point(60, 40), point(120, 5), point(180, 10), point(240, 80)]);
    expect(result.tenToEighty).toEqual({ minutes: null, reason: "soc-regression" });
  });

  it("sorts and merges agreeing duplicates without mutating the caller's data", () => {
    const input = session(1, 2, { points: [point(120, 80), point(0, 10), point(60, 45), point(60, 45)] });
    const copy = structuredClone(input);
    const result = analyzeDcCharges([input]).sessions[0]!;
    expect(result.tenToEighty).toEqual({ minutes: 2, reason: null });
    expect(result.curveSegments[0]).toHaveLength(3);
    expect(result.powerCoveragePercent).toBe(100);
    expect(input).toEqual(copy);
  });

  it("rejects conflicting simultaneous SoC measurements rather than averaging them", () => {
    const result = analyze([point(0, 10), point(60, 40), point(60, 50), point(120, 80)]);
    expect(result.tenToEighty).toEqual({ minutes: null, reason: "conflicting-points" });
    expect(result.curveSegments).toEqual([]);
  });

  it("ignores samples outside session bounds", () => {
    const result = analyze([point(-60, 10), point(0, 20), point(60, 50), point(120, 70), point(180, 80)], { endTime: 120_000 });
    expect(result.tenToEighty.reason).toBe("partial-session");
    expect(result.curveSegments[0]!.map((sample) => sample.soc)).toEqual([20, 50, 70]);
  });

  it.each([
    { startTime: 120_000, endTime: 0 },
    { startTime: 0, endTime: 0 },
    { startTime: Number.NaN, endTime: 120_000 },
    { startTime: 0, endTime: Number.POSITIVE_INFINITY },
  ])("rejects invalid session bounds: %o", (bounds) => {
    const result = analyze([point(0, 10), point(120, 80)], bounds);
    expect(result.tenToEighty.reason).toBe("missing-points");
    expect(result.averagePowerKw).toBeNull();
    expect(result.powerCoveragePercent).toBe(0);
    expect(result.curveSegments).toEqual([]);
  });
});

describe("DC power statistics", () => {
  it("weights interval means by actual elapsed time, not the number of samples", () => {
    const result = analyze([point(0, 10, 0), point(10, 20, 120), point(70, 80, 60)], { endTime: 100_000 });
    expect(result.averagePowerKw).toBeCloseTo((60 * 10 + 90 * 60) / 70);
    expect(result.observedPowerMinutes).toBeCloseTo(70 / 60);
    expect(result.powerCoveragePercent).toBe(70);
  });

  it("does not interpolate average power across missing data or long gaps", () => {
    const result = analyze([point(0, 10, 100), point(30, 20, null), point(60, 30, 200), point(600, 60, 200), point(660, 80, 100)], { endTime: 1200_000 });
    expect(result.averagePowerKw).toBe(150);
    expect(result.observedPowerMinutes).toBe(1);
    expect(result.powerCoveragePercent).toBe(5);
  });

  it("keeps a zero-power observation valid and missing values absent", () => {
    const zero = analyze([point(0, 10, 0), point(60, 80, 0)], { maxPowerKw: 0 });
    expect(zero.averagePowerKw).toBe(0);
    expect(zero.peakPowerKw).toBe(0);
    const missing = analyze([]);
    expect(missing.averagePowerKw).toBeNull();
    expect(missing.peakPowerKw).toBeNull();
  });

  it("retains the true overall peak separately from the median of session averages", () => {
    const result = analyzeDcCharges([
      session(1, 20, { maxPowerKw: 300 }),
      session(2, 20, { maxPowerKw: 150 }),
      session(3, 20, { points: [], maxPowerKw: 180 }),
      session(4, 20, { points: [point(0, 10, 220), point(60, 80, 200)], maxPowerKw: 190 }),
    ]);
    expect(result.summary.peakPowerKw).toBe(300);
    expect(result.summary.medianAveragePowerKw).toBe(100);
    expect(result.sessions[2]!.peakPowerKw).toBe(180);
    expect(result.sessions[3]!.peakPowerKw).toBe(220);
  });

  it("discards conflicting duplicate power for interpolation but retains observed peaks and SoC timing", () => {
    const result = analyze([point(0, 10, 100), point(60, 45, 200), point(60, 45, 250), point(120, 80, 100)]);
    expect(result.tenToEighty.minutes).toBe(2);
    expect(result.averagePowerKw).toBeNull();
    expect(result.peakPowerKw).toBe(250);
    expect(result.curveSegments).toEqual([]);
  });

  it("excludes non-finite and impossible sensor values", () => {
    const result = analyze([
      point(0, 10, 100), point(30, Number.NaN, -1), point(60, 101, Number.POSITIVE_INFINITY),
      point(90, 70, 90), point(120, 80, 80), point(Number.NaN, 30, 999),
    ], { maxPowerKw: Number.NaN, outsideTempAvg: Number.NaN });
    expect(result.tenToEighty.reason).toBe("data-gap");
    expect(result.peakPowerKw).toBe(100);
    expect(result.averagePowerKw).toBe(85);
    expect(result.outsideTempAvg).toBeNull();
    expect(result.curveSegments[0]!.map((sample) => sample.soc)).toEqual([70, 80]);
  });
});

describe("DC comparison summary, locations and slow-session hints", () => {
  it("returns explicit empty results and preserves the selected session order", () => {
    expect(analyzeDcCharges([])).toEqual({
      sessions: [], locations: [], summary: {
        sessionCount: 0, timingSessionCount: 0, medianTenToEightyMinutes: null,
        medianAveragePowerKw: null, peakPowerKw: null,
      },
    });
    const result = analyzeDcCharges([session(3, 21), session(1, 10), session(2, 20), session(4, 30)]);
    expect(result.sessions.map((charge) => charge.id)).toEqual([3, 1, 2, 4]);
    expect(result.summary.medianTenToEightyMinutes).toBe(20.5);
  });

  it("ranks only identified locations with at least two valid 10–80 windows", () => {
    const result = analyzeDcCharges([
      session(1, 30, { placeId: 1 }), session(2, 40, { placeId: 1 }),
      session(3, 20, { placeId: 2 }), session(4, 24, { placeId: 2 }),
      session(5, 10, { placeId: 3 }), session(6, 10, { placeId: 3, points: [] }),
      session(7, 5, { placeId: null, address: null, placeName: null }),
      session(8, 5, { placeId: null, address: null, placeName: null }),
    ]);
    expect(result.locations.map((location) => [location.key, location.rankingEligible])).toEqual([
      ["place:2", true], ["place:1", true], ["unknown", false], ["place:3", false],
    ]);
    expect(result.locations[0]!.medianTenToEightyMinutes).toBe(22);
    expect(result.locations[3]).toMatchObject({ sessionCount: 2, timingSessionCount: 1 });
    expect(result.summary.timingSessionCount).toBe(7);
  });

  it("groups a consistent address when a place has not been assigned", () => {
    const result = analyzeDcCharges([
      session(1, 20, { placeId: null, address: " Station  road " }),
      session(2, 30, { placeId: null, address: "station road" }),
    ]);
    expect(result.locations).toHaveLength(1);
    expect(result.locations[0]).toMatchObject({ sessionCount: 2, medianTenToEightyMinutes: 25, rankingEligible: true });
  });

  it("requires three OTHER timing-valid sessions before flagging a slower session", () => {
    const result = analyzeDcCharges([session(1, 40), session(2, 20), session(3, 20), session(4, 20, { points: [] })]);
    expect(result.sessions[0]!.slowHint).toBeNull();
    const qualified = analyzeDcCharges([session(1, 40), session(2, 20), session(3, 20), session(4, 20)]);
    expect(qualified.sessions[0]!.slowHint).toEqual({
      peerCount: 3, peerMedianMinutes: 20, slowerMinutes: 20, slowerPercent: 100, temperatureMatched: false,
    });
  });

  it.each([
    [24, 20, false], // Four minutes is below both thresholds.
    [20, 15, true], // Five minutes and >25% qualify.
    [25, 20, true], // Both thresholds are inclusive.
    [26, 21, false], // Five minutes alone is not enough (<25%).
    [10, 7, false], // >25% alone is not enough (<5 minutes).
  ])("checks both slow thresholds for %i versus %i minute peers", (duration, baseline, expected) => {
    const result = analyzeDcCharges([session(1, duration), session(2, baseline), session(3, baseline), session(4, baseline)]);
    expect(result.sessions[0]!.slowHint !== null).toBe(expected);
  });

  it("uses a median baseline so one slow peer does not dominate it", () => {
    const result = analyzeDcCharges([session(1, 30), session(2, 20), session(3, 20), session(4, 100)]);
    expect(result.sessions[0]!.slowHint).toMatchObject({ peerMedianMinutes: 20, slowerMinutes: 10 });
  });

  it("uses outside-temperature context only when three nearby-temperature peers exist", () => {
    const result = analyzeDcCharges([
      session(1, 35, { outsideTempAvg: 10 }),
      session(2, 30, { outsideTempAvg: 5 }), session(3, 30, { outsideTempAvg: 10 }), session(4, 30, { outsideTempAvg: 15 }),
      session(5, 10, { outsideTempAvg: 30 }), session(6, 10, { outsideTempAvg: 30 }), session(7, 10, { outsideTempAvg: 30 }),
    ]);
    // Same-temperature peers suppress the misleading all-session baseline.
    expect(result.sessions[0]!.slowHint).toBeNull();
    const flagged = analyzeDcCharges([
      session(1, 40, { outsideTempAvg: 10 }),
      session(2, 30, { outsideTempAvg: 5 }), session(3, 30, { outsideTempAvg: 10 }), session(4, 30, { outsideTempAvg: 15 }),
      session(5, 10, { outsideTempAvg: 30 }),
    ]);
    expect(flagged.sessions[0]!.slowHint).toMatchObject({ peerCount: 3, peerMedianMinutes: 30, temperatureMatched: true });
  });

  it("does not claim temperature matching with only two nearby-temperature peers", () => {
    const result = analyzeDcCharges([
      session(1, 40, { outsideTempAvg: 10 }),
      session(2, 20, { outsideTempAvg: 5 }), session(3, 20, { outsideTempAvg: 15 }),
      session(4, 20, { outsideTempAvg: null }),
    ]);
    expect(result.sessions[0]!.slowHint).toMatchObject({ peerCount: 3, temperatureMatched: false });
  });
});
