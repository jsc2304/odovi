"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Zap } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  formatConsumption,
  formatKm,
  formatKwh,
  formatTime,
} from "@odovi/core";
import { toIntlLocale } from "../../../lib/i18nLocale";
import {
  applyCalendarMetric,
  formatMonthLabel,
  type CalendarCell,
  type CalendarDayStats,
  type CalendarMetric,
} from "../../../lib/calendarGrid";

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const METRICS: CalendarMetric[] = ["distance", "consumption", "energy", "trips"];
const METRIC_STORAGE_KEY = "odovi_calendar_metric";
const LEGACY_METRIC_STORAGE_KEY = "tripatlas_calendar_metric";

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
  locale: string,
): string {
  const partial = stats.hasIncompleteEnergy ? "†" : "";
  switch (metric) {
    case "distance":
      return formatKm(stats.totalKm, locale);
    case "consumption":
      if (stats.avgConsumptionWhKm == null) return "–";
      return `${formatConsumption(stats.avgConsumptionWhKm, stats.anyEstimated)}${partial}`;
    case "energy":
      return stats.totalEnergyKwh > 0
        ? `${stats.anyEstimated ? "~" : ""}${formatKwh(stats.totalEnergyKwh, {}, locale)}${partial}`
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
  month,
  vehicleQuery,
  timeZone,
}: {
  cells: CalendarCell[];
  month: string;
  vehicleQuery: string;
  timeZone: string;
}) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const [metric, setMetric] = useState<CalendarMetric>("distance");
  const [preview, setPreview] = useState<CalendarCell | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const metricRef = useRef<HTMLDivElement>(null);
  const dayQuery = `${vehicleQuery || "?"}${vehicleQuery ? "&" : ""}month=${month}`;

  useEffect(() => {
    const saved =
      window.localStorage.getItem(METRIC_STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_METRIC_STORAGE_KEY);
    if (saved && METRICS.includes(saved as CalendarMetric)) {
      setMetric(saved as CalendarMetric);
      window.localStorage.setItem(METRIC_STORAGE_KEY, saved);
    }
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!preview || !dialog) return;
    // showModal provides focus containment and makes the document background inert.
    dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [preview]);

  function restoreFocus() {
    setPreview(null);
    if (triggerRef.current?.isConnected) triggerRef.current.focus();
    else metricRef.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus();
  }

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
          className="inline-flex flex-wrap items-center rounded-lg border border-neutral-200 bg-white p-0.5 dark:border-neutral-800 dark:bg-neutral-900"
          ref={metricRef}
          aria-label={t("metric.label")}
          role="group"
        >
          {METRICS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={metric === value}
              onClick={() => selectMetric(value)}
              className={`min-h-11 min-w-11 rounded-md px-2 py-1 text-xs font-medium transition sm:px-2.5 ${
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
        <p className="my-2 text-xs text-neutral-500 dark:text-neutral-400">{t("preview.hint")}</p>
        <div className="overflow-x-auto overscroll-contain" role="region" tabIndex={0} aria-label={t("gridLabel", { month: formatMonthLabel(month, locale) })}>
        <div className="min-w-[16rem]">
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-neutral-500 dark:text-neutral-400">
          {WEEKDAY_KEYS.map((key) => (
            <div key={key} className="py-1">
              {t(`weekday.${key}`)}
            </div>
          ))}
        </div>

        <div className="mt-1 grid grid-cols-7 gap-1">
          {metricCells.map((cell) => {
            const contents = (
              <>
                <span className="flex w-full flex-wrap items-center justify-between gap-0.5">
                  <span data-calendar-date className="min-w-0 tabular-nums [overflow-wrap:anywhere]">{cell.dayOfMonth}</span>
                  {cell.stats && cell.stats.chargeCount > 0 && <Zap aria-label={t("chargeIcon")} size={12} className="shrink-0 text-amber-700 dark:text-amber-400" />}
                </span>
                {cell.stats && cell.stats.driveCount > 0 && (
                  <span className="mt-auto block w-full text-[0.625rem] font-medium tabular-nums text-neutral-600 [overflow-wrap:anywhere] dark:text-neutral-400 sm:text-xs">
                    {metricText(cell.stats, metric, true, driveCountLabel, toIntlLocale(locale))}
                  </span>
                )}
              </>
            );
            const cellClass = `flex min-h-16 min-w-[24px] flex-col items-start gap-1 rounded-lg border p-1 text-left text-xs transition hover:border-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-900 dark:hover:border-neutral-600 dark:focus-visible:ring-white sm:min-h-20 sm:p-2 ${
              cell.isToday || selectedDate === cell.date ? "border-2 border-neutral-900 dark:border-white" : "border-neutral-200 dark:border-neutral-800"
            } ${intensityClasses(cell.intensity)} ${cell.inMonth ? "text-neutral-900 dark:text-neutral-100" : "text-neutral-500 dark:text-neutral-400"}`;
            const summary = cell.stats ? t("daySummary", { date: cell.date, metric: `${t(`metric.${metric}`)}: ${metricText(cell.stats, metric, false, driveCountLabel, toIntlLocale(locale))}` }) : `${cell.date}: ${t("preview.empty")}`;
            return cell.inMonth ? (
              <button key={cell.date} data-testid="calendar-day-cell" data-date={cell.date} type="button"
                aria-label={`${t("preview.open", { date: cell.date })}. ${summary}${cell.stats?.chargeCount ? `. ${t("preview.charges", { count: cell.stats.chargeCount })}` : ""}`}
                aria-haspopup="dialog" aria-expanded={preview?.date === cell.date} aria-current={cell.isToday ? "date" : undefined}
                className={cellClass}
                onClick={(event) => { triggerRef.current = event.currentTarget; setSelectedDate(cell.date); setPreview(cell); }}>
                {contents}
              </button>
            ) : (
              <Link key={cell.date} data-testid="calendar-day-cell" href={`/day/${cell.date}${dayQuery}`} aria-label={t("preview.openDayDate", { date: cell.date })} className={cellClass}>{contents}</Link>
            );
          })}
        </div>
        </div>
        </div>
      </div>

      {preview && (
        <dialog
          ref={dialogRef}
          aria-labelledby="calendar-preview-title"
          aria-describedby="calendar-preview-summary"
          onClose={restoreFocus}
          onKeyDown={(event) => {
            if (event.key !== "Tab") return;
            const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button, a[href], [tabindex]'))
              .filter((element) => element.tabIndex >= 0 && !element.hasAttribute("disabled") && element.getClientRects().length > 0);
            const first = controls[0];
            const last = controls.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
          }}
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            if (event.target === event.currentTarget && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) dialogRef.current?.close();
          }}
          className="m-auto max-h-[80dvh] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-neutral-200 bg-white p-4 text-neutral-900 shadow-xl backdrop:bg-black/40 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 sm:p-5"
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
                <p id="calendar-preview-summary" className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                  {t("preview.summary", {
                    count: preview.stats?.driveCount ?? 0,
                    distance: formatKm(preview.stats?.totalKm ?? 0, toIntlLocale(locale)),
                  })}
                </p>
              </div>
              <button
                type="button"
                autoFocus
                onClick={() => dialogRef.current?.close()}
                aria-label={t("preview.close")}
                className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
              >
                <X aria-hidden size={18} />
              </button>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              {METRICS.map((value) => <div key={value}>
                <dt className="text-xs text-neutral-500 dark:text-neutral-400">{t(`metric.${value}`)}</dt>
                <dd className="mt-1 break-words font-medium tabular-nums">{preview.stats ? metricText(preview.stats, value, false, driveCountLabel, toIntlLocale(locale)) : value === "distance" ? formatKm(0, toIntlLocale(locale)) : value === "trips" ? driveCountLabel(0) : "–"}</dd>
              </div>)}
              <div className="col-span-2"><dt className="text-xs text-neutral-500 dark:text-neutral-400">{t("chargeIcon")}</dt><dd className="mt-1">{t("preview.charges", { count: preview.stats?.chargeCount ?? 0 })}</dd></div>
            </dl>
            {!preview.stats?.driveCount && <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">{t("preview.empty")}</p>}

            <ol className="mt-4 divide-y divide-neutral-100 dark:divide-neutral-800">
              {(preview.stats?.drives ?? []).map((drive) => (
                <li key={drive.id}>
                  <Link
                    href={`/drives/${drive.id}?returnTo=${encodeURIComponent(`/day/${preview.date}${dayQuery}#drive-${drive.id}`)}`}
                    className="block min-h-11 py-3 hover:text-neutral-600 dark:hover:text-neutral-300"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                        {formatTime(new Date(drive.startTimeIso), timeZone)}
                      </span>
                      {drive.distanceKm != null && (
                        <span className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                          {formatKm(drive.distanceKm, toIntlLocale(locale))}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 break-words text-sm font-medium">
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

            {preview.stats?.hasIncompleteEnergy && (
              <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                {t("preview.partialEnergy")}
              </p>
            )}

            <Link
              href={`/day/${preview.date}${dayQuery}`}
              className="mt-4 flex min-h-11 items-center justify-center rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
            >
              {t("preview.openDay")}
            </Link>
        </dialog>
      )}
    </>
  );
}
