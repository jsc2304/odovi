"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { List, X, Zap } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  formatConsumption,
  formatKm,
  formatKwh,
  formatTime,
} from "@tripatlas/core";
import { toIntlLocale } from "../../../lib/i18nLocale";
import {
  applyCalendarMetric,
  type CalendarCell,
  type CalendarDayStats,
  type CalendarMetric,
} from "../../../lib/calendarGrid";

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const METRICS: CalendarMetric[] = ["distance", "consumption", "energy", "trips"];
const METRIC_STORAGE_KEY = "tripatlas_calendar_metric";

function intensityClasses(intensity: number): string {
  if (intensity <= 0) return "";
  if (intensity < 0.34) return "bg-sky-50 dark:bg-sky-950/40";
  if (intensity < 0.67) return "bg-sky-100 dark:bg-sky-900/50";
  return "bg-sky-200 dark:bg-sky-800/60";
}

function metricText(
  stats: CalendarDayStats,
  metric: CalendarMetric,
  compact: boolean,
  driveCountLabel: (count: number) => string,
): string {
  const partial = stats.hasIncompleteEnergy ? "†" : "";
  switch (metric) {
    case "distance":
      return compact
        ? formatKm(stats.totalKm)
        : `${stats.driveCount} · ${formatKm(stats.totalKm)}`;
    case "consumption":
      if (stats.avgConsumptionWhKm == null) return "–";
      return compact
        ? `${Math.round(stats.avgConsumptionWhKm)}${stats.anyEstimated ? "~" : ""}${partial}`
        : `${formatConsumption(stats.avgConsumptionWhKm, stats.anyEstimated)}${partial}`;
    case "energy":
      return stats.totalEnergyKwh > 0
        ? formatKwh(stats.totalEnergyKwh)
        : "–";
    case "trips":
      return compact
        ? String(stats.driveCount)
        : driveCountLabel(stats.driveCount);
  }
}

function placeLabel(
  name: string | null,
  address: string | null,
  fallback: string,
): string {
  return name?.trim() || address?.trim() || fallback;
}

export function MonthGrid({
  cells,
  vehicleQuery,
  timeZone,
}: {
  cells: CalendarCell[];
  vehicleQuery: string;
  timeZone: string;
}) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const [metric, setMetric] = useState<CalendarMetric>("distance");
  const [preview, setPreview] = useState<CalendarCell | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(METRIC_STORAGE_KEY);
    if (METRICS.includes(saved as CalendarMetric)) {
      setMetric(saved as CalendarMetric);
    }
  }, []);

  useEffect(() => {
    if (!preview) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setPreview(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [preview]);

  const metricCells = useMemo(
    () => applyCalendarMetric(cells, metric),
    [cells, metric],
  );
  const driveCountLabel = (count: number) => t("driveCountLabel", { count });

  function selectMetric(next: CalendarMetric) {
    setMetric(next);
    window.localStorage.setItem(METRIC_STORAGE_KEY, next);
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <div
          className="inline-flex items-center rounded-lg border border-neutral-200 bg-white p-0.5 dark:border-neutral-800 dark:bg-neutral-900"
          aria-label={t("metric.label")}
          role="group"
        >
          {METRICS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={metric === value}
              onClick={() => selectMetric(value)}
              className={`rounded-md px-2 py-1 text-xs font-medium transition sm:px-2.5 ${
                metric === value
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
              }`}
            >
              {t(`metric.${value}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-900 sm:p-3">
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-neutral-500 dark:text-neutral-400">
          {WEEKDAY_KEYS.map((key) => (
            <div key={key} className="py-1">
              {t(`weekday.${key}`)}
            </div>
          ))}
        </div>

        <div className="mt-1 grid grid-cols-7 gap-1">
          {metricCells.map((cell) => (
            <div
              key={cell.date}
              data-testid="calendar-day-cell"
              className={`group relative aspect-square rounded-lg border text-xs transition hover:border-neutral-400 dark:hover:border-neutral-600 sm:aspect-auto sm:min-h-20 ${
                cell.isToday
                  ? "border-2 border-neutral-900 dark:border-white"
                  : "border-neutral-200 dark:border-neutral-800"
              } ${intensityClasses(cell.intensity)} ${cell.inMonth ? "" : "opacity-40"}`}
            >
              <Link
                href={`/day/${cell.date}${vehicleQuery}`}
                className="flex h-full min-h-11 w-full flex-col items-center justify-start rounded-lg p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-900 dark:focus-visible:ring-white sm:items-start sm:p-2"
                aria-label={
                  cell.stats
                    ? t("daySummary", {
                        date: cell.date,
                        metric: metricText(cell.stats, metric, false, driveCountLabel),
                      })
                    : cell.date
                }
              >
                <div className="flex w-full items-center justify-between">
                  <span
                    className={`tabular-nums ${
                      cell.inMonth
                        ? "text-neutral-900 dark:text-neutral-100"
                        : "text-neutral-400 dark:text-neutral-600"
                    }`}
                  >
                    {cell.dayOfMonth}
                  </span>
                  {cell.stats && cell.stats.chargeCount > 0 && (
                    <Zap aria-label={t("chargeIcon")} size={12} className="text-amber-500" />
                  )}
                </div>
                {cell.stats && cell.stats.driveCount > 0 && (
                  <>
                    <span className="mt-auto max-w-full truncate pr-4 text-[10px] font-medium tabular-nums text-neutral-600 dark:text-neutral-400 sm:hidden">
                      {metricText(cell.stats, metric, true, driveCountLabel)}
                    </span>
                    <span className="mt-auto hidden max-w-full truncate pr-5 text-[11px] tabular-nums text-neutral-600 dark:text-neutral-400 sm:block">
                      {metricText(cell.stats, metric, false, driveCountLabel)}
                    </span>
                  </>
                )}
              </Link>

              {cell.stats && cell.stats.driveCount > 0 && (
                <button
                  type="button"
                  onClick={() => setPreview(cell)}
                  aria-label={t("preview.open", { date: cell.date })}
                  className="absolute bottom-0.5 right-0.5 z-[1] flex h-5 w-5 items-center justify-center rounded text-neutral-400 hover:bg-white/80 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 dark:hover:bg-neutral-900/80 dark:hover:text-white dark:focus-visible:ring-white sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                >
                  <List aria-hidden size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {preview?.stats && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setPreview(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-preview-title"
            className="max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl dark:bg-neutral-900 sm:rounded-2xl sm:p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="calendar-preview-title" className="font-semibold">
                  {new Intl.DateTimeFormat(toIntlLocale(locale), {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    timeZone: "UTC",
                  }).format(new Date(`${preview.date}T12:00:00Z`))}
                </h2>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                  {t("preview.summary", {
                    count: preview.stats.driveCount,
                    distance: formatKm(preview.stats.totalKm),
                  })}
                </p>
              </div>
              <button
                type="button"
                autoFocus
                onClick={() => setPreview(null)}
                aria-label={t("preview.close")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
              >
                <X aria-hidden size={18} />
              </button>
            </div>

            <ol className="mt-4 divide-y divide-neutral-100 dark:divide-neutral-800">
              {preview.stats.drives.map((drive) => (
                <li key={drive.id}>
                  <Link
                    href={`/drives/${drive.id}`}
                    className="block py-3 hover:text-neutral-600 dark:hover:text-neutral-300"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                        {formatTime(new Date(drive.startTimeIso), timeZone)}
                      </span>
                      {drive.distanceKm != null && (
                        <span className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                          {formatKm(drive.distanceKm)}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-sm font-medium">
                      {placeLabel(
                        drive.startPlaceName,
                        drive.startAddress,
                        t("preview.unknownPlace"),
                      )}{" "}
                      <span className="text-neutral-400">→</span>{" "}
                      {placeLabel(
                        drive.endPlaceName,
                        drive.endAddress,
                        t("preview.unknownPlace"),
                      )}
                    </p>
                    {drive.avgConsumptionWhKm != null && (
                      <p className="mt-0.5 text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                        {formatConsumption(
                          drive.avgConsumptionWhKm,
                          drive.energyIsEstimated,
                        )}
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            </ol>

            {preview.stats.hasIncompleteEnergy && (
              <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500">
                {t("preview.partialEnergy")}
              </p>
            )}

            <Link
              href={`/day/${preview.date}${vehicleQuery}`}
              className="mt-4 flex min-h-11 items-center justify-center rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
            >
              {t("preview.openDay")}
            </Link>
          </section>
        </div>
      )}
    </>
  );
}
