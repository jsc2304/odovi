import { describe, expect, it } from "vitest";
import {
  resolveDashboardParkDrainSession,
  sumParkDrainSessions,
} from "./parkDrain";

describe("resolveDashboardParkDrainSession", () => {
  it("uses the current SoC loss and elapsed time for an open park", () => {
    const result = resolveDashboardParkDrainSession(
      {
        id: 1,
        startTime: new Date("2026-08-22T14:00:00Z"),
        endTime: null,
      },
      { lossPct: 1, hadCharge: false, nextStartSoc: 49 },
      null,
      new Date("2026-08-23T12:00:00Z"),
    );

    expect(result).toEqual({
      id: 1,
      ongoing: true,
      drainSince: new Date("2026-08-22T14:00:00Z"),
      durationSeconds: 22 * 60 * 60,
      lossPct: 1,
    });
  });

  it("starts the drain interval at a charge that ended during the park", () => {
    const result = resolveDashboardParkDrainSession(
      {
        id: 2,
        startTime: new Date("2026-08-22T08:00:00Z"),
        endTime: null,
      },
      { lossPct: null, hadCharge: true, nextStartSoc: 79 },
      {
        endTime: new Date("2026-08-22T15:00:00Z"),
        endSoc: 80,
      },
      new Date("2026-08-22T22:00:00Z"),
    );

    expect(result.drainSince).toEqual(new Date("2026-08-22T15:00:00Z"));
    expect(result.durationSeconds).toBe(7 * 60 * 60);
    expect(result.lossPct).toBe(1);
  });
});

describe("sumParkDrainSessions", () => {
  const base = {
    ongoing: false,
    drainSince: new Date("2026-08-22T10:00:00Z"),
    durationSeconds: 3600,
  };

  it("adds all measurable park losses", () => {
    expect(
      sumParkDrainSessions([
        { ...base, id: 1, lossPct: 1 },
        { ...base, id: 2, lossPct: 2 },
      ]),
    ).toBe(3);
  });

  it("returns null rather than understating an incomplete total", () => {
    expect(
      sumParkDrainSessions([
        { ...base, id: 1, lossPct: 1 },
        { ...base, id: 2, lossPct: null },
      ]),
    ).toBeNull();
  });
});
