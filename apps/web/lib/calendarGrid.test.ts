import { describe, expect, it } from "vitest";
import {
  applyCalendarMetric,
  buildCalendarGrid,
  formatMonthLabel,
  isValidMonthParam,
  shiftMonth,
  type CalendarDayStats,
} from "./calendarGrid";

function dayStats(
  date: string,
  overrides: Partial<CalendarDayStats> = {},
): CalendarDayStats {
  return {
    date,
    driveCount: 0,
    totalKm: 0,
    chargeCount: 0,
    totalEnergyKwh: 0,
    usableDistanceKm: 0,
    avgConsumptionWhKm: null,
    anyEstimated: false,
    hasIncompleteEnergy: false,
    drives: [],
    ...overrides,
  };
}

describe("shiftMonth", () => {
  it("shifts within a year", () => {
    expect(shiftMonth("2026-06", 1)).toBe("2026-07");
    expect(shiftMonth("2026-06", -1)).toBe("2026-05");
  });

  it("handles year boundaries", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});

describe("isValidMonthParam", () => {
  it("accepts valid YYYY-MM", () => {
    expect(isValidMonthParam("2026-07")).toBe(true);
    expect(isValidMonthParam("2026-01")).toBe(true);
    expect(isValidMonthParam("2026-12")).toBe(true);
  });

  it("rejects malformed or out-of-range months", () => {
    expect(isValidMonthParam("2026-13")).toBe(false);
    expect(isValidMonthParam("2026-00")).toBe(false);
    expect(isValidMonthParam("2026-7")).toBe(false);
    expect(isValidMonthParam("not-a-month")).toBe(false);
  });
});

describe("formatMonthLabel", () => {
  it("formats de-DE month + year", () => {
    expect(formatMonthLabel("2026-07")).toBe("Juli 2026");
    expect(formatMonthLabel("2026-01")).toBe("Januar 2026");
  });
});

describe("buildCalendarGrid", () => {
  it("produces a grid whose length is a multiple of 7", () => {
    const grid = buildCalendarGrid("2026-07", new Map(), "2026-07-01");
    expect(grid.length % 7).toBe(0);
  });

  it("starts on Monday and ends on Sunday", () => {
    const grid = buildCalendarGrid("2026-07", new Map(), "2026-07-01");
    // 2026-07-01 is a Wednesday -> 2 leading days (Mon, Tue).
    expect(grid[0]!.date).toBe("2026-06-29");
    expect(grid[0]!.inMonth).toBe(false);
    expect(grid.at(-1)!.inMonth).toBe(false);
  });

  it("marks in-month days and today correctly", () => {
    const grid = buildCalendarGrid("2026-07", new Map(), "2026-07-15");
    const july15 = grid.find((c) => c.date === "2026-07-15")!;
    expect(july15.inMonth).toBe(true);
    expect(july15.isToday).toBe(true);
    expect(july15.dayOfMonth).toBe(15);

    const other = grid.find((c) => c.date === "2026-07-14")!;
    expect(other.isToday).toBe(false);
  });

  it("computes intensity relative to the month max km", () => {
    const stats = new Map<string, CalendarDayStats>([
      ["2026-07-05", dayStats("2026-07-05", { driveCount: 2, totalKm: 20 })],
      ["2026-07-10", dayStats("2026-07-10", { driveCount: 4, totalKm: 40, chargeCount: 1 })],
    ]);
    const grid = buildCalendarGrid("2026-07", stats, "2026-07-01");
    const day5 = grid.find((c) => c.date === "2026-07-05")!;
    const day10 = grid.find((c) => c.date === "2026-07-10")!;
    const empty = grid.find((c) => c.date === "2026-07-01")!;

    expect(day10.intensity).toBe(1);
    expect(day5.intensity).toBeCloseTo(0.5);
    expect(empty.intensity).toBe(0);
    expect(empty.stats).toBeNull();
  });

  it("recomputes intensity for the selected metric", () => {
    const stats = new Map<string, CalendarDayStats>([
      [
        "2026-07-05",
        dayStats("2026-07-05", {
          driveCount: 4,
          totalKm: 100,
          totalEnergyKwh: 10,
          avgConsumptionWhKm: 100,
        }),
      ],
      [
        "2026-07-10",
        dayStats("2026-07-10", {
          driveCount: 2,
          totalKm: 50,
          totalEnergyKwh: 15,
          avgConsumptionWhKm: 300,
        }),
      ],
    ]);
    const distanceGrid = buildCalendarGrid("2026-07", stats, "2026-07-01");
    const consumptionGrid = applyCalendarMetric(distanceGrid, "consumption");
    const tripsGrid = applyCalendarMetric(distanceGrid, "trips");

    expect(consumptionGrid.find((c) => c.date === "2026-07-10")!.intensity).toBe(1);
    expect(consumptionGrid.find((c) => c.date === "2026-07-05")!.intensity).toBeCloseTo(1 / 3);
    expect(tripsGrid.find((c) => c.date === "2026-07-05")!.intensity).toBe(1);
    expect(tripsGrid.find((c) => c.date === "2026-07-10")!.intensity).toBe(0.5);
  });

  it("handles an empty month with no stats at all", () => {
    const grid = buildCalendarGrid("2026-01", new Map(), "2026-07-01");
    expect(grid.every((c) => c.intensity === 0)).toBe(true);
    expect(grid.filter((c) => c.inMonth).length).toBe(31);
  });

  it("handles December -> January year-boundary trailing days", () => {
    const grid = buildCalendarGrid("2026-12", new Map(), "2026-12-01");
    const trailing = grid.filter((c) => !c.inMonth && c.date > "2026-12-31");
    for (const cell of trailing) {
      expect(cell.date.startsWith("2027-01")).toBe(true);
    }
  });
});
