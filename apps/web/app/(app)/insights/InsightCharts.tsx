"use client";

import React, { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Bin } from "@odovi/core";
import { toIntlLocale } from "../../../lib/i18nLocale";
import styles from "./Insights.module.css";

// Gemeinsame SVG-Geometrie, an DriveChart/ChargeChart (M18/M19) angelehnt:
// 600×200-viewBox, dark-mode-aware currentColor-Klassen, min/max-Achsenlabels.
// Bewusst einfacher gehalten als DriveChart — statische Achsenbeschriftung,
// dezente Punktwolke, eine Bin-Mittel-Linie; kein Serien-Toggle.
const CHART_WIDTH = 600;
const CHART_HEIGHT = 200;
const PADDING = { top: 16, right: 16, bottom: 26, left: 44 };

const INNER_W = CHART_WIDTH - PADDING.left - PADDING.right;
const INNER_H = CHART_HEIGHT - PADDING.top - PADDING.bottom;
const PLOT_BOTTOM = PADDING.top + INNER_H;

function useChartNumbers() {
  const locale = useLocale();
  return new Intl.NumberFormat(toIntlLocale(locale), { maximumFractionDigits: 1 });
}

function ChartData({ caption, columns, rows }: { caption: string; columns: string[]; rows: string[][] }) {
  const t = useTranslations("insights");
  return (
    <details className="mt-3" data-chart-data>
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">{t("charts.dataView")}</summary>
      <p className="mb-2 text-xs text-neutral-500 dark:text-neutral-400">{t("charts.rounding")}</p>
      <div className="max-h-96 overflow-auto overscroll-contain" tabIndex={0} role="region" aria-label={caption}>
        <table className="w-full text-left text-xs tabular-nums">
          <caption className="mb-2 text-left font-medium">{caption}</caption>
          <thead><tr>{columns.map((column, index) => <th key={index} scope="col" className="border-b border-neutral-200 px-2 py-2 dark:border-neutral-800">{column}</th>)}</tr></thead>
          <tbody>{rows.map((row, index) => <tr key={index}>{row.map((value, cell) => <td key={cell} className="border-b border-neutral-100 px-2 py-2 dark:border-neutral-800">{value}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </details>
  );
}

/** „nice"-Wert nach unten/oben für ruhige Achsengrenzen. */
function niceMin(v: number, step: number): number {
  return Math.floor(v / step) * step;
}
function niceMax(v: number, step: number): number {
  return Math.ceil(v / step) * step;
}

export interface ScatterPoint {
  x: number;
  y: number;
}

/**
 * Streudiagramm (jede Fahrt ein dezenter Punkt) + Bin-Mittel-Linie. Verwendet
 * für „Verbrauch vs. Außentemperatur" und „Verbrauch vs. Tempo". X-/Y-Einheit
 * und Bin-Achsenschritt kommen als Props.
 */
export function ScatterBinnedChart({
  points,
  bins,
  xUnit,
  yUnit,
  xLabel,
  xStep = 5,
  ariaLabel,
}: {
  points: ScatterPoint[];
  bins: Bin[];
  xUnit: string;
  yUnit: string;
  xLabel: string;
  /** Schrittweite der X-Achsengrenzen-Rundung (z. B. 5 °C, 10 km/h). */
  xStep?: number;
  ariaLabel: string;
}) {
  const t = useTranslations("insights");
  const numFmt = useChartNumbers();

  const geom = useMemo(() => {
    const xsAll = [...points.map((p) => p.x), ...bins.map((b) => b.xCenter)];
    const ysAll = [...points.map((p) => p.y), ...bins.map((b) => b.meanY)];
    const xMin = niceMin(Math.min(...xsAll), xStep);
    const xMax = niceMax(Math.max(...xsAll), xStep);
    const yMinRaw = Math.min(...ysAll);
    const yMaxRaw = Math.max(...ysAll);
    // Y mit etwas Luft, an 20er-Schritten ausgerichtet.
    const yMin = niceMin(yMinRaw - (yMaxRaw - yMinRaw) * 0.05, 20);
    const yMax = niceMax(yMaxRaw + (yMaxRaw - yMinRaw) * 0.05, 20);
    return {
      xMin,
      xMax,
      xRange: xMax - xMin || 1,
      yMin,
      yMax,
      yRange: yMax - yMin || 1,
    };
  }, [points, bins, xStep]);

  const toX = (x: number) =>
    PADDING.left + ((x - geom.xMin) / geom.xRange) * INNER_W;
  const toY = (y: number) =>
    PADDING.top + INNER_H - ((y - geom.yMin) / geom.yRange) * INNER_H;

  const linePath = useMemo(() => {
    let d = "";
    bins.forEach((b, i) => {
      d += `${i === 0 ? "M" : "L"} ${toX(b.xCenter).toFixed(1)} ${toY(b.meanY).toFixed(1)} `;
    });
    return d.trim();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bins, geom]);

  if (points.length === 0 && bins.length === 0) return <p>{t("charts.noData")}</p>;

  return (
    <div>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className={styles.chart}
        role="img"
        aria-label={ariaLabel}
      >
        {/* Horizontales Grid + Y-Achsen-Labels (min/mid/max) */}
        {[0, 0.5, 1].map((f, i) => {
          const y = PADDING.top + INNER_H - f * INNER_H;
          const val = geom.yMin + f * geom.yRange;
          return (
            <g key={`grid-${i}`}>
              <line
                x1={PADDING.left}
                x2={CHART_WIDTH - PADDING.right}
                y1={y}
                y2={y}
                className="stroke-neutral-200 dark:stroke-neutral-700"
                strokeWidth={1}
              />
              <text
                x={PADDING.left - 6}
                y={y}
                textAnchor="end"
                dominantBaseline={i === 2 ? "hanging" : i === 0 ? "auto" : "middle"}
                className="fill-neutral-500 text-[9px] dark:fill-neutral-400"
              >
                {numFmt.format(Math.round(val))}
              </text>
            </g>
          );
        })}

        {/* X-Achsen-Labels min/max */}
        {[geom.xMin, geom.xMax].map((val, i) => (
          <text
            key={`xa-${i}`}
            x={i === 0 ? PADDING.left : CHART_WIDTH - PADDING.right}
            y={PLOT_BOTTOM + 14}
            textAnchor={i === 0 ? "start" : "end"}
            className="fill-neutral-500 text-[9px] dark:fill-neutral-400"
          >
            {numFmt.format(val)} {xUnit}
          </text>
        ))}
        <text
          x={PADDING.left}
          y={PADDING.top - 6}
          className="fill-neutral-500 text-[9px] dark:fill-neutral-400"
        >
          {yUnit}
        </text>

        {/* Dezente Punktwolke */}
        {points.map((p, i) => (
          <circle
            key={`pt-${i}`}
            cx={toX(p.x)}
            cy={toY(p.y)}
            r={2}
            className="fill-sky-700 dark:fill-sky-500"
          />
        ))}

        {/* Bin-Mittel-Linie */}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            className="text-sky-700 dark:text-sky-400"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {/* Group means; exact values remain available in the data tables. */}
        {bins.map((b, i) => (
          <circle
            key={`bin-${i}`}
            cx={toX(b.xCenter)}
            cy={toY(b.meanY)}
            r={3.5}
            className="text-sky-700 dark:text-sky-400"
            fill="currentColor"
            stroke="white"
            strokeWidth={1}
          />
        ))}
      </svg>

      <div className={styles.legend}>
        <span>{t("charts.individualPoints", { count: points.length })}</span>
        <span className={styles.legendRoute}>{t("charts.scatterLegend", { step: xStep, unit: xUnit })}</span>
      </div>
      <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">{t("charts.binLimit")}</p>
      {bins.length > 0 && <ChartData caption={t("charts.groupedValues")} columns={[`${xLabel} (${xUnit})`, `${t("charts.meanConsumption")} (${yUnit})`, t("charts.drives")]} rows={bins.map((bin) => [`${numFmt.format(bin.xStart)} ≤ x < ${numFmt.format(bin.xStart + xStep)}`, numFmt.format(bin.meanY), String(bin.count)])} />}
      <ChartData caption={ariaLabel} columns={[`${xLabel} (${xUnit})`, `${t("charts.consumption")} (${yUnit})`]} rows={points.map((point) => [numFmt.format(point.x), numFmt.format(point.y)])} />
    </div>
  );
}

export interface MonthDatum {
  label: string;
  km: number;
  meanConsumption: number;
  driveCount: number;
}

/**
 * Monatsverlauf: km als Balken (linke Achse) + Ø-Verbrauch als Linie (rechte
 * Achse). Zwei kleine Serien mit de-DE-Monatslabels.
 */
export function MonthChart({ months }: { months: MonthDatum[] }) {
  const t = useTranslations("insights");
  const numFmt = useChartNumbers();

  if (months.length === 0) return <p>{t("charts.noData")}</p>;

  const kmMax = niceMax(Math.max(...months.map((m) => m.km), 1), 100);
  const consVals = months.map((m) => m.meanConsumption);
  const consMin = niceMin(Math.min(...consVals) - 10, 20);
  const consMax = niceMax(Math.max(...consVals) + 10, 20);
  const consRange = consMax - consMin || 1;

  const n = months.length;
  const slot = INNER_W / n;
  const barW = Math.min(slot * 0.5, 48);

  const barX = (i: number) => PADDING.left + slot * i + slot / 2;
  const kmToY = (km: number) => PADDING.top + INNER_H - (km / kmMax) * INNER_H;
  const consToY = (c: number) =>
    PADDING.top + INNER_H - ((c - consMin) / consRange) * INNER_H;

  const linePath = months
    .map((m, i) => `${i === 0 ? "M" : "L"} ${barX(i).toFixed(1)} ${consToY(m.meanConsumption).toFixed(1)}`)
    .join(" ");
  const showMonthLabel = (index: number) =>
    n <= 16 || index === 0 || index === n - 1 || (index % 3 === 0 && index < n - 2);

  return (
    <div>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className={styles.monthChart}
        role="img"
        aria-label={t("charts.monthChartAriaLabel")}
      >
        {[0, 0.5, 1].map((f, i) => {
          const y = PADDING.top + INNER_H - f * INNER_H;
          return (
            <line
              key={`grid-${i}`}
              x1={PADDING.left}
              x2={CHART_WIDTH - PADDING.right}
              y1={y}
              y2={y}
              className="stroke-neutral-200 dark:stroke-neutral-700"
              strokeWidth={1}
            />
          );
        })}

        {/* km-Balken (Cobalt) */}
        {months.map((m, i) => {
          const y = kmToY(m.km);
          return (
            <rect
              key={`bar-${i}`}
              x={barX(i) - barW / 2}
              y={y}
              width={barW}
              height={PLOT_BOTTOM - y}
              rx={3}
              className="fill-violet-600 dark:fill-violet-500"
              />
          );
        })}

        {/* Verbrauchslinie (Glacier) */}
        <path
          d={linePath}
          fill="none"
          className="text-sky-700 dark:text-sky-400"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {months.map((m, i) => (
          <circle
            key={`cd-${i}`}
            cx={barX(i)}
            cy={consToY(m.meanConsumption)}
            r={3.5}
            className="text-sky-700 dark:text-sky-400"
            fill="currentColor"
            stroke="white"
            strokeWidth={1}
          />
        ))}

        {/* Linke Achse: km (max) */}
        <text
          x={PADDING.left - 6}
          y={PADDING.top}
          textAnchor="end"
          dominantBaseline="hanging"
          className="fill-violet-700 text-[9px] dark:fill-violet-400"
        >
          {numFmt.format(kmMax)} km
        </text>
        {/* Rechte Achse: Verbrauch (min/max) */}
        {[consMax, consMin].map((val, i) => (
          <text
            key={`ra-${i}`}
            x={CHART_WIDTH - PADDING.right + 6}
            y={i === 0 ? PADDING.top : PLOT_BOTTOM}
            textAnchor="end"
            dominantBaseline={i === 0 ? "hanging" : "auto"}
            className="fill-neutral-500 text-[9px] dark:fill-neutral-400"
          >
            {numFmt.format(val)}
          </text>
        ))}

        {/* Monatslabels */}
        {months.map((m, i) =>
          showMonthLabel(i) ? (
            <text
              key={`ml-${i}`}
              x={barX(i)}
              y={PLOT_BOTTOM + 14}
              textAnchor="middle"
              className="fill-neutral-500 text-[9px] dark:fill-neutral-400"
            >
              {m.label}
            </text>
          ) : null,
        )}
      </svg>

      <div className={styles.legend}>
        <span className={styles.legendCobalt}>{t("charts.distanceBars")}</span>
        <span className={styles.legendRoute}>
          {t("charts.monthChartConsumptionLegend")}
        </span>

      </div>
      <ChartData caption={t("charts.monthChartAriaLabel")} columns={[t("charts.month"), "km", t("charts.monthChartConsumptionLegend"), t("charts.drives")]} rows={months.map((month) => [month.label, numFmt.format(month.km), numFmt.format(month.meanConsumption), String(month.driveCount)])} />
    </div>
  );
}

export interface WeekdayDatum {
  label: string;
  km: number;
  count: number;
}

/** Wochentagsmuster: km je Wochentag (Mo–So) als Balken + Fahrtenanzahl. */
export function WeekdayChart({ days }: { days: WeekdayDatum[] }) {
  const t = useTranslations("insights");
  const numFmt = useChartNumbers();
  if (days.length === 0) return <p>{t("charts.noData")}</p>;
  const kmMax = niceMax(Math.max(...days.map((d) => d.km), 1), 50);

  const n = days.length;
  const slot = INNER_W / n;
  const barW = Math.min(slot * 0.6, 40);
  const barX = (i: number) => PADDING.left + slot * i + slot / 2;
  const kmToY = (km: number) => PADDING.top + INNER_H - (km / kmMax) * INNER_H;

  return (
    <div>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className={styles.weekdayChart}
        role="img"
        aria-label={t("charts.weekdayChartAriaLabel")}
      >
        {[0, 0.5, 1].map((f, i) => {
          const y = PADDING.top + INNER_H - f * INNER_H;
          const val = (kmMax * f);
          return (
            <g key={`grid-${i}`}>
              <line
                x1={PADDING.left}
                x2={CHART_WIDTH - PADDING.right}
                y1={y}
                y2={y}
                className="stroke-neutral-200 dark:stroke-neutral-700"
                strokeWidth={1}
              />
              <text
                x={PADDING.left - 6}
                y={y}
                textAnchor="end"
                dominantBaseline={i === 2 ? "hanging" : i === 0 ? "auto" : "middle"}
                className="fill-neutral-500 text-[9px] dark:fill-neutral-400"
              >
                {numFmt.format(Math.round(val))}
              </text>
            </g>
          );
        })}

        {days.map((d, i) => {
          const y = kmToY(d.km);
          return (
            <rect
              key={`bar-${i}`}
              x={barX(i) - barW / 2}
              y={y}
              width={barW}
              height={PLOT_BOTTOM - y}
              rx={3}
              className="fill-violet-600 dark:fill-violet-500"
              />
          );
        })}

        <text
          x={PADDING.left}
          y={PADDING.top - 6}
          className="fill-neutral-500 text-[9px] dark:fill-neutral-400"
        >
          km
        </text>

        {days.map((d, i) => (
          <text
            key={`dl-${i}`}
            x={barX(i)}
            y={PLOT_BOTTOM + 14}
            textAnchor="middle"
            className="fill-neutral-500 text-[9px] dark:fill-neutral-400"
          >
            {d.label}
          </text>
        ))}
      </svg>

      <div className={styles.legend}>
        <span className={styles.legendCobalt}>
          {t("charts.weekdayChartLegend")}
        </span>

      </div>
      <ChartData caption={t("charts.weekdayChartAriaLabel")} columns={[t("charts.weekday"), "km", t("charts.drives")]} rows={days.map((day) => [day.label, numFmt.format(day.km), String(day.count)])} />
    </div>
  );
}

/**
 * Kurzstrecken-Donut: Anteil Fahrten < 5 km als Ring, mit Ø-Verbrauch
 * Kurzstrecke vs. Gesamt daneben. Rein präsentativ, kein Hover nötig.
 */
export function ShortTripDonut({
  shortShare,
  shortCount,
  totalCount,
  shortMeanConsumption,
  overallMeanConsumption,
}: {
  shortShare: number;
  shortCount: number;
  totalCount: number;
  shortMeanConsumption: number | null;
  overallMeanConsumption: number | null;
}) {
  const t = useTranslations("insights");
  const numFmt = useChartNumbers();
  const pct = Math.round(shortShare * 100);
  const R = 42;
  const C = 2 * Math.PI * R;
  const dash = C * shortShare;

  const surplus =
    shortMeanConsumption != null && overallMeanConsumption != null && overallMeanConsumption > 0
      ? (shortMeanConsumption - overallMeanConsumption) / overallMeanConsumption
      : null;

  return (
    <div className={styles.donutLayout}>
      <svg
        viewBox="0 0 120 120"
        className={styles.donut}
        role="img"
        aria-label={t("charts.shortTripAriaLabel", { pct })}
      >
        <circle
          cx={60}
          cy={60}
          r={R}
          fill="none"
          strokeWidth={14}
          className="stroke-neutral-200 dark:stroke-neutral-700"
        />
        <circle
          cx={60}
          cy={60}
          r={R}
          fill="none"
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${C - dash}`}
          className={styles.donutArc}
          stroke="currentColor"
        />
        <text
          x={60}
          y={60}
          textAnchor="middle"
          dominantBaseline="central"
          className="rotate-90 fill-neutral-900 text-[22px] font-semibold tabular-nums dark:fill-neutral-100"
          style={{ transformOrigin: "60px 60px" }}
        >
          {pct}%
        </text>
      </svg>

      <div className={styles.donutCopy}>
        <p>
          <span className="font-semibold tabular-nums">{shortCount}</span>{" "}
          {t("charts.shortTripOf")}{" "}
          <span className="tabular-nums">{totalCount}</span> {t("charts.shortTripTail")}
        </p>
        {shortMeanConsumption != null && overallMeanConsumption != null && (
          <div className={styles.donutStats}>
            <span>
              {t("charts.avgShortTrip")}{" "}
              <span className="font-medium tabular-nums text-neutral-900 dark:text-neutral-100">
                {numFmt.format(Math.round(shortMeanConsumption))} Wh/km
              </span>
            </span>
            <span>
              {t("charts.avgOverall")}{" "}
              <span className="font-medium tabular-nums text-neutral-900 dark:text-neutral-100">
                {numFmt.format(Math.round(overallMeanConsumption))} Wh/km
              </span>
            </span>
          </div>
        )}
        {surplus != null && surplus > 0.01 && (
          <p className={styles.surplus}>
            {t("charts.surplusPrefix")}{" "}
            <span className="font-semibold tabular-nums">
              +{Math.round(surplus * 100)}%
            </span>{" "}
            {t("charts.surplusSuffix")}
          </p>
        )}
      </div>
    </div>
  );
}
