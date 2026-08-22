"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  computeElevationGain,
  formatSpeed,
  haversineDistanceM,
  smoothElevations,
} from "@tripatlas/core";
import type { ChartRoutePoint } from "../../../../lib/driveRoute";

export interface DriveChartProps {
  points: ChartRoutePoint[];
  /** Anteil (0..1) der Punkte mit befülltem elevation_m — steuert Höhe-Serie. */
  elevationCoverage: number;
  /** TeslaMate-Höhenmeter der Fahrt, zum Vergleich. */
  teslamateAscentM: number | null;
  teslamateDescentM: number | null;
}

const CHART_WIDTH = 600;
const CHART_HEIGHT = 200;
const PADDING = { top: 14, right: 44, bottom: 22, left: 44 };
// Ab diesem Anteil befüllter elevation_m-Werte wird die Höhe-Serie angeboten.
const MIN_ELEVATION_COVERAGE = 0.6;

type SeriesKey = "elevation" | "soc" | "speed";

interface SeriesMeta {
  key: SeriesKey;
  label: string;
  unit: string;
  /** Tailwind-Klasse für Linie/Chip (stroke + text), dark-mode-aware. */
  colorClass: string;
  swatch: string; // Hex für den Chip-Punkt (light); Chart nutzt currentColor via colorClass
  swatchDark: string;
}

/** Translated series metadata — labels come from the "drives" namespace, everything else is static. */
function buildSeriesMeta(t: (key: string) => string): Record<SeriesKey, SeriesMeta> {
  return {
    elevation: {
      key: "elevation",
      label: t("chart.elevation"),
      unit: "m",
      colorClass: "text-blue-600 dark:text-blue-400",
      swatch: "#7c3aed",
      swatchDark: "#a78bfa",
    },
    soc: {
      key: "soc",
      label: "SoC",
      unit: "%",
      colorClass: "text-emerald-600 dark:text-emerald-400",
      swatch: "#059669",
      swatchDark: "#34d399",
    },
    speed: {
      key: "speed",
      label: t("chart.speed"),
      unit: "km/h",
      colorClass: "text-amber-600 dark:text-amber-400",
      swatch: "#d97706",
      swatchDark: "#fbbf24",
    },
  };
}

interface PreparedSeries {
  key: SeriesKey;
  /** Werte je Punkt-Index (null = Lücke). */
  values: (number | null)[];
  min: number;
  max: number;
}

/** Kumulierte Haversine-Distanz in km entlang der Punktfolge, beginnend bei 0. */
function cumulativeDistanceKm(points: { lat: number; lon: number }[]): number[] {
  const result: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const cur = points[i]!;
    const meters = haversineDistanceM(prev.lat, prev.lon, cur.lat, cur.lon);
    result.push(result[i - 1]! + meters / 1000);
  }
  return result;
}

/**
 * Hand-gebautes, responsives SVG-Multi-Kurven-Chart „Verlauf" (M18) —
 * kombiniert Höhe (Fläche), SoC und Tempo (Linien) über der gemeinsamen
 * X-Achse „kumulierte Distanz" (Haversine, Index-Fallback). Ersetzt das
 * frühere ElevationProfile und behält dessen Qualität (dark-mode-aware,
 * min/max-Achsenbeschriftung).
 *
 * Achsen-Zuordnungsregel (bewusst simpel gehalten, nicht pixelgenau perfekt):
 *   - RECHTE Achse ist fix für SoC (0–100 %), wenn SoC sichtbar ist.
 *   - LINKE Achse zeigt Höhe (m), sonst — wenn Höhe aus ist — Tempo (km/h).
 *     Sind Höhe UND Tempo gleichzeitig sichtbar, teilt sich Tempo optisch die
 *     linke Skala (eigene Normierung), beschriftet wird aber nur die Höhe;
 *     Tempo bleibt über die Legende/Tooltip lesbar. Nie mehr als zwei
 *     Achsen-Label-Gruppen, damit das Bild ruhig bleibt.
 */
export function DriveChart({
  points,
  elevationCoverage,
  teslamateAscentM,
  teslamateDescentM,
}: DriveChartProps) {
  const t = useTranslations("drives");
  const SERIES_META = useMemo(() => buildSeriesMeta(t), [t]);

  const hasElevation = elevationCoverage >= MIN_ELEVATION_COVERAGE;

  const data = useMemo(() => {
    const distances = cumulativeDistanceKm(points);
    const total = distances[distances.length - 1] ?? 0;
    // Fallback auf Index, falls keine sinnvolle Distanz vorliegt.
    const indexMode = total <= 0.01; // Null-Distanz-Track → X-Achse als Punkt-Index
    const xs = indexMode ? points.map((_, i) => i) : distances;
    const totalX = xs[xs.length - 1] || 1;

    const socValues = points.map((p) => (p.soc != null ? p.soc : null));
    const speedValues = points.map((p) =>
      p.speedKmh != null ? p.speedKmh : null,
    );

    // Höhe: nur wenn Abdeckung ausreicht; sonst gar keine Serie.
    let elevationValues: (number | null)[] = [];
    let elevationGain = { gainM: 0, lossM: 0 };
    if (hasElevation) {
      const withEl = points.map((p) => p.elevationM);
      const present = withEl.filter((v): v is number => v != null);
      const smoothed = smoothElevations(present.map((elevationM) => ({ elevationM })));
      elevationGain = computeElevationGain(smoothed);
      // Geglättete Werte zurück auf die Original-Indizes mappen (Lücken bleiben null).
      let si = 0;
      elevationValues = withEl.map((v) => (v != null ? smoothed[si++]! : null));
    }

    const series: PreparedSeries[] = [];
    const build = (key: SeriesKey, values: (number | null)[]) => {
      const nums = values.filter((v): v is number => v != null);
      if (nums.length < 2) return;
      series.push({
        key,
        values,
        min: Math.min(...nums),
        max: Math.max(...nums),
      });
    };
    if (hasElevation) build("elevation", elevationValues);
    build("soc", socValues);
    build("speed", speedValues);

    const speedNums = speedValues.filter((v): v is number => v != null);
    const avgSpeed =
      speedNums.length > 0
        ? speedNums.reduce((a, b) => a + b, 0) / speedNums.length
        : null;
    const maxSpeed = speedNums.length > 0 ? Math.max(...speedNums) : null;

    return { xs, totalX, indexMode, series, elevationGain, avgSpeed, maxSpeed };
  }, [points, hasElevation]);

  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>({
    elevation: true,
    soc: true,
    speed: true,
  });

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const availableSeries = data.series;
  const visibleSeries = availableSeries.filter((s) => visible[s.key]);

  const innerWidth = CHART_WIDTH - PADDING.left - PADDING.right;
  const innerHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const plotBottom = PADDING.top + innerHeight;

  const toX = (i: number) =>
    PADDING.left + (data.xs[i]! / data.totalX) * innerWidth;

  // Für jede Serie eine eigene y-Normierung. SoC ist fix 0–100.
  const scaleFor = (s: PreparedSeries) => {
    if (s.key === "soc") {
      return { min: 0, max: 100 };
    }
    const pad = (s.max - s.min) * 0.08 || 1;
    return { min: s.min - pad, max: s.max + pad };
  };
  const toY = (s: PreparedSeries, value: number) => {
    const { min, max } = scaleFor(s);
    const range = max - min || 1;
    return PADDING.top + innerHeight - ((value - min) / range) * innerHeight;
  };

  const buildPath = (s: PreparedSeries): string => {
    let d = "";
    let started = false;
    s.values.forEach((v, i) => {
      if (v == null) {
        started = false;
        return;
      }
      const cmd = started ? "L" : "M";
      d += `${cmd} ${toX(i).toFixed(1)} ${toY(s, v).toFixed(1)} `;
      started = true;
    });
    return d.trim();
  };

  // Achsen-Labels: links = Höhe (falls sichtbar), sonst Tempo. Rechts = SoC.
  const leftAxisSeries =
    visibleSeries.find((s) => s.key === "elevation") ??
    visibleSeries.find((s) => s.key === "speed") ??
    null;
  const rightAxisVisible = visibleSeries.some((s) => s.key === "soc");

  function handleMove(clientX: number) {
    const svg = svgRef.current;
    if (!svg || data.xs.length === 0) return;
    const rect = svg.getBoundingClientRect();
    // Client-x in viewBox-Koordinaten umrechnen.
    const vbX = ((clientX - rect.left) / rect.width) * CHART_WIDTH;
    // Nächsten Index über die X-Distanz suchen.
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < data.xs.length; i++) {
      const dx = Math.abs(toX(i) - vbX);
      if (dx < best) {
        best = dx;
        nearest = i;
      }
    }
    setHoverIdx(nearest);
  }

  function throttledMove(clientX: number) {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      handleMove(clientX);
    });
  }

  if (availableSeries.length === 0) {
    return (
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        {t("chart.noData")}
      </p>
    );
  }

  const hoverX = hoverIdx != null ? toX(hoverIdx) : null;
  const leftScale = leftAxisSeries ? scaleFor(leftAxisSeries) : null;

  return (
    <div>
      {/* Legende-Chips zum Ein-/Ausblenden der Serien */}
      <div className="mb-3 flex flex-wrap gap-2">
        {availableSeries.map((s) => {
          const meta = SERIES_META[s.key];
          const on = visible[s.key];
          return (
            <button
              key={s.key}
              type="button"
              onClick={() =>
                setVisible((v) => ({ ...v, [s.key]: !v[s.key] }))
              }
              aria-pressed={on}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                on
                  ? "border-neutral-300 bg-neutral-50 text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
                  : "border-neutral-200 bg-transparent text-neutral-400 dark:border-neutral-800 dark:text-neutral-600"
              }`}
            >
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-full"
                style={{
                  backgroundColor: on ? meta.swatch : "transparent",
                  boxShadow: on ? undefined : `inset 0 0 0 1.5px currentColor`,
                }}
              />
              {meta.label}
            </button>
          );
        })}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="h-52 w-full touch-none"
        role="img"
        aria-label={t("chart.ariaLabel")}
        onMouseMove={(e) => throttledMove(e.clientX)}
        onMouseLeave={() => setHoverIdx(null)}
        onTouchStart={(e) => {
          const t = e.touches[0];
          if (t) handleMove(t.clientX);
        }}
        onTouchMove={(e) => {
          const t = e.touches[0];
          if (t) throttledMove(t.clientX);
        }}
        onTouchEnd={() => setHoverIdx(null)}
      >
        {/* Horizontales Grid (min/mid/max) an der linken Skala orientiert */}
        {leftScale &&
          [0, 0.5, 1].map((f, i) => {
            const y = PADDING.top + innerHeight - f * innerHeight;
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

        {/* Höhe als Fläche (falls sichtbar) */}
        {visibleSeries
          .filter((s) => s.key === "elevation")
          .map((s) => {
            const line = buildPath(s);
            if (!line) return null;
            // Fläche: Linie + zurück entlang der Grundlinie.
            const firstIdx = s.values.findIndex((v) => v != null);
            let lastIdx = -1;
            for (let i = s.values.length - 1; i >= 0; i--) {
              if (s.values[i] != null) {
                lastIdx = i;
                break;
              }
            }
            if (firstIdx < 0 || lastIdx < 0) return null;
            const area =
              `${line} L ${toX(lastIdx).toFixed(1)} ${plotBottom.toFixed(1)} ` +
              `L ${toX(firstIdx).toFixed(1)} ${plotBottom.toFixed(1)} Z`;
            return (
              <path
                key="elevation-area"
                d={area}
                className="fill-blue-500/15 dark:fill-blue-400/15"
              />
            );
          })}

        {/* Linien je sichtbarer Serie */}
        {visibleSeries.map((s) => {
          const d = buildPath(s);
          if (!d) return null;
          return (
            <path
              key={s.key}
              d={d}
              fill="none"
              className={SERIES_META[s.key].colorClass}
              stroke="currentColor"
              strokeWidth={1.25}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}

        {/* Linke Achsen-Labels (min/max der linken Serie) */}
        {leftAxisSeries &&
          leftScale &&
          [leftScale.max, leftScale.min].map((val, i) => {
            const y = i === 0 ? PADDING.top : plotBottom;
            return (
              <text
                key={`la-${i}`}
                x={PADDING.left - 6}
                y={y}
                textAnchor="end"
                dominantBaseline={i === 0 ? "hanging" : "auto"}
                className={`text-[9px] ${SERIES_META[leftAxisSeries.key].colorClass} fill-current`}
              >
                {Math.round(val)} {SERIES_META[leftAxisSeries.key].unit}
              </text>
            );
          })}

        {/* Rechte Achse: SoC 0–100 % */}
        {rightAxisVisible &&
          [100, 0].map((val, i) => {
            const y = i === 0 ? PADDING.top : plotBottom;
            return (
              <text
                key={`ra-${i}`}
                x={CHART_WIDTH - PADDING.right + 6}
                y={y}
                textAnchor="start"
                dominantBaseline={i === 0 ? "hanging" : "auto"}
                className={`text-[9px] ${SERIES_META.soc.colorClass} fill-current`}
              >
                {val} %
              </text>
            );
          })}

        {/* Hover-Führungslinie + Punkte */}
        {hoverX != null && hoverIdx != null && (
          <>
            <line
              x1={hoverX}
              x2={hoverX}
              y1={PADDING.top}
              y2={plotBottom}
              className="stroke-neutral-400 dark:stroke-neutral-500"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            {visibleSeries.map((s) => {
              const v = s.values[hoverIdx];
              if (v == null) return null;
              return (
                <circle
                  key={`dot-${s.key}`}
                  cx={hoverX}
                  cy={toY(s, v)}
                  r={3}
                  className={SERIES_META[s.key].colorClass}
                  fill="currentColor"
                  stroke="white"
                  strokeWidth={1}
                />
              );
            })}
          </>
        )}
      </svg>

      {/* Tooltip als HTML unter dem SVG (positionsstabil, gut lesbar auf Touch) */}
      {hoverIdx != null && visibleSeries.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span className="text-neutral-500 dark:text-neutral-400 tabular-nums">
            {formatDistanceKm(data.xs[hoverIdx]!, data.indexMode, t)}
          </span>
          {visibleSeries.map((s) => {
            const v = s.values[hoverIdx!];
            if (v == null) return null;
            const meta = SERIES_META[s.key];
            return (
              <span
                key={`tt-${s.key}`}
                className={`inline-flex items-center gap-1 tabular-nums ${meta.colorClass}`}
              >
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: meta.swatch }}
                />
                {Math.round(v)} {meta.unit}
              </span>
            );
          })}
        </div>
      )}

      {/* Höhenmeter-Zeile (bleibt) + Tempo-Zeile (neu) */}
      {visible.elevation && data.series.some((s) => s.key === "elevation") && (
        <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
          ↗ {Math.round(data.elevationGain.gainM)} m · ↘{" "}
          {Math.round(data.elevationGain.lossM)} m{" "}
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {t("chart.elevationCalcNote")}
          </span>
        </p>
      )}
      {(teslamateAscentM != null || teslamateDescentM != null) &&
        data.series.some((s) => s.key === "elevation") && (
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {t("chart.teslamateElevation", {
              ascent: teslamateAscentM ?? "—",
              descent: teslamateDescentM ?? "—",
            })}
          </p>
        )}
      {data.avgSpeed != null && data.maxSpeed != null && (
        <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
          {t("chart.avgMaxSpeed", {
            avg: formatSpeed(data.avgSpeed),
            max: formatSpeed(data.maxSpeed),
          })}
        </p>
      )}
    </div>
  );
}

/** Kompakte Distanzanzeige für den Tooltip (de-DE Komma, eine Nachkommastelle
 *  bei echter Distanz; ganzzahliger Index, falls kein sinnvoller Track). */
function formatDistanceKm(
  x: number,
  indexMode: boolean,
  t: (key: string, values?: Record<string, string | number | Date>) => string,
): string {
  if (indexMode) {
    return t("chart.pointIndex", { index: x });
  }
  return `${x.toLocaleString("de-DE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} km`;
}
