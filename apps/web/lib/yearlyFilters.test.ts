import { describe, expect, it, vi } from "vitest";

vi.mock("./config", () => ({ APP_TIMEZONE: "Pacific/Auckland" }));
import { currentInsightYear, insightYearBounds, parseYearlyFilters } from "./yearlyFilters";

const newYearInAuckland = new Date("2025-12-31T12:00:00Z");

describe("yearly insight filters", () => {
  it("defaults to the current application-local year", () => {
    expect(currentInsightYear(newYearInAuckland)).toBe(2026);
    expect(parseYearlyFilters({}, newYearInAuckland)).toEqual({ year: 2026, classification: "all" });
  });

  it.each(["2025", "1970"])("accepts a supported past year %s", (year) => {
    expect(parseYearlyFilters({ year, classification: "business" }, newYearInAuckland))
      .toEqual({ year: Number(year), classification: "business" });
  });

  it.each(["", "1969", "2027", "9999", "2025-01", "25", "2025.0", "2025 OR 1=1", ["2024", "2025"]])(
    "defaults malformed, repeated or out-of-range year %j", (year) => {
      expect(parseYearlyFilters({ year }, newYearInAuckland).year).toBe(2026);
    },
  );

  it.each(["all", "private", "business", "commute", "unclassified"])("accepts classification %s", (classification) => {
    expect(parseYearlyFilters({ classification }, newYearInAuckland).classification).toBe(classification);
  });

  it.each(["invalid", "BUSINESS", ["business", "private"]])("defaults invalid classification %j", (classification) => {
    expect(parseYearlyFilters({ classification }, newYearInAuckland).classification).toBe("all");
  });

  it("uses local-midnight boundaries even when they occur in the previous UTC year", () => {
    const bounds = insightYearBounds(2026);
    expect(bounds.start.toISOString()).toBe("2025-12-31T11:00:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-12-31T11:00:00.000Z");
  });
});
