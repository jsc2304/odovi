/**
 * Pure calendar-grid math for the month view (M11) — no DB or `server-only`
 * imports, so this stays independently unit-testable. The grouped DB query
 * lives in `lib/calendar.ts`.
 */

import { toIntlLocale } from "./i18nLocale";

export interface CalendarDayStats {
  /** YYYY-MM-DD, local calendar day in APP_TIMEZONE. */
  date: string;
  driveCount: number;
  totalKm: number;
  chargeCount: number;
  totalEnergyKwh: number;
  usableDistanceKm: number;
  avgConsumptionWhKm: number | null;
  anyEstimated: boolean;
  hasIncompleteEnergy: boolean;
  drives: CalendarDrivePreview[];
}

export interface CalendarDrivePreview {
  id: number;
  startTimeIso: string;
  startPlaceName: string | null;
  startAddress: string | null;
  endPlaceName: string | null;
  endAddress: string | null;
  distanceKm: number | null;
  avgConsumptionWhKm: number | null;
  energyIsEstimated: boolean;
}

export type CalendarMetric = "distance" | "consumption" | "energy" | "trips";

export interface CalendarCell {
  date: string; // YYYY-MM-DD
  dayOfMonth: number;
  inMonth: boolean;
  isToday: boolean;
  stats: CalendarDayStats | null;
  /** 0..1 relative to the month's maximum selected metric. */
  intensity: number;
}

/** Monday-first weekday index (0 = Mon .. 6 = Sun) for a YYYY-MM-DD string. */
function mondayIndex(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  // Date.UTC(...).getUTCDay(): 0 = Sun .. 6 = Sat. Shift to Monday-first.
  const jsDay = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  return (jsDay + 6) % 7;
}

function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, m!, 0)).getUTCDate();
}

function addDaysToMonthDay(month: string, day: number): string {
  const [y, m] = month.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, day));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Adds `delta` days to a YYYY-MM-DD string, staying in the calendar domain. */
function shiftDate(date: string, delta: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + delta));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function makeCell(
  date: string,
  inMonth: boolean,
  today: string,
  statsByDay: Map<string, CalendarDayStats>,
): CalendarCell {
  const stats = statsByDay.get(date) ?? null;
  const dayOfMonth = Number(date.slice(8, 10));
  return {
    date,
    dayOfMonth,
    inMonth,
    isToday: date === today,
    stats,
    intensity: 0,
  };
}

export function calendarMetricValue(
  stats: CalendarDayStats | null,
  metric: CalendarMetric,
): number | null {
  if (!stats) return null;
  switch (metric) {
    case "distance":
      return stats.totalKm > 0 ? stats.totalKm : null;
    case "consumption":
      return stats.avgConsumptionWhKm;
    case "energy":
      return stats.totalEnergyKwh > 0 ? stats.totalEnergyKwh : null;
    case "trips":
      return stats.driveCount > 0 ? stats.driveCount : null;
  }
}

/** Recomputes the subtle cell intensity for the selected display metric. */
export function applyCalendarMetric(
  cells: CalendarCell[],
  metric: CalendarMetric,
): CalendarCell[] {
  const max = Math.max(
    0,
    ...cells
      .filter((cell) => cell.inMonth)
      .map((cell) => calendarMetricValue(cell.stats, metric) ?? 0),
  );
  return cells.map((cell) => {
    const value = calendarMetricValue(cell.stats, metric);
    return {
      ...cell,
      intensity: value != null && max > 0 ? Math.min(1, value / max) : 0,
    };
  });
}

/**
 * Builds a full Mo–So month grid (always a multiple of 7 cells, including
 * leading/trailing days of adjacent months) with per-day stats and a
 * 0..1 intensity relative to the month's maximum distance by default.
 */
export function buildCalendarGrid(
  month: string,
  statsByDay: Map<string, CalendarDayStats>,
  today: string,
): CalendarCell[] {
  const firstOfMonth = `${month}-01`;
  const leading = mondayIndex(firstOfMonth);
  const totalDays = daysInMonth(month);

  const cells: CalendarCell[] = [];

  // Leading days from the previous month.
  for (let i = leading; i > 0; i--) {
    const date = shiftDate(firstOfMonth, -i);
    cells.push(makeCell(date, false, today, statsByDay));
  }

  // Days of the current month.
  for (let day = 1; day <= totalDays; day++) {
    const date = addDaysToMonthDay(month, day);
    cells.push(makeCell(date, true, today, statsByDay));
  }

  // Trailing days from the next month, padded to a full week row.
  const remainder = cells.length % 7;
  if (remainder !== 0) {
    const lastDate = cells[cells.length - 1]!.date;
    const toAdd = 7 - remainder;
    for (let i = 1; i <= toAdd; i++) {
      const date = shiftDate(lastDate, i);
      cells.push(makeCell(date, false, today, statsByDay));
    }
  }

  return applyCalendarMetric(cells, "distance");
}

/** Shifts a YYYY-MM string by `delta` months, handling year boundaries. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const idx = y! * 12 + (m! - 1) + delta;
  const yy = Math.floor(idx / 12);
  const mm = (idx % 12) + 1;
  return `${yy}-${String(mm).padStart(2, "0")}`;
}

const MONTH_RE = /^\d{4}-\d{2}$/;

/** Validates a YYYY-MM string (calendar-valid month 01-12). */
export function isValidMonthParam(month: string): boolean {
  if (!MONTH_RE.test(month)) return false;
  const m = Number(month.slice(5, 7));
  return m >= 1 && m <= 12;
}

/** Formats a YYYY-MM string as a localized month/year label. */
export function formatMonthLabel(month: string, locale = "de"): string {
  const [y, m] = month.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, 1, 12));
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(dt);
}

/** German Mo–So single/double-letter weekday initials, Monday-first. */
export const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
