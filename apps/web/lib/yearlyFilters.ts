import type { YearlyClassificationFilter } from "@odovi/core";
import { APP_TIMEZONE } from "./config";
import { dayBounds } from "./day";

export interface YearlyFilters {
  year: number;
  classification: YearlyClassificationFilter;
}

export function currentInsightYear(now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-US", {
    year: "numeric", timeZone: APP_TIMEZONE,
  }).format(now));
}

/** Only supported single-valued filters enter the database and core layers. */
export function parseYearlyFilters(
  params: { year?: string | string[]; classification?: string | string[] },
  now: Date = new Date(),
): YearlyFilters {
  const currentYear = currentInsightYear(now);
  const requestedYear = typeof params.year === "string" && /^\d{4}$/.test(params.year)
    ? Number(params.year) : Number.NaN;
  const year = Number.isInteger(requestedYear) && requestedYear >= 1970 && requestedYear <= currentYear
    ? requestedYear : currentYear;
  const requestedClass = params.classification;
  const classification: YearlyClassificationFilter = requestedClass === "private"
    || requestedClass === "business" || requestedClass === "commute" || requestedClass === "unclassified"
    ? requestedClass : "all";
  return { year, classification };
}

/** Calendar-year boundaries use the same application timezone as daily views. */
export function insightYearBounds(year: number): { start: Date; end: Date } {
  return {
    start: dayBounds(`${year}-01-01`).start,
    end: dayBounds(`${year + 1}-01-01`).start,
  };
}
