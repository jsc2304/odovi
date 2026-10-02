import React from "react";

export interface ComparisonSeries {
  id: number;
  label: string;
  segments: Array<Array<{ soc: number; powerKw: number }>>;
}

const SERIES_COLORS = [
  "text-emerald-700 dark:text-emerald-400",
  "text-sky-700 dark:text-sky-400",
  "text-violet-700 dark:text-violet-400",
  "text-amber-700 dark:text-amber-400",
  "text-rose-700 dark:text-rose-400",
] as const;

const SERIES_DASHES = [
  undefined, "8 4", "2 4", "12 3 2 3", "8 3 2 3 2 3",
  "14 5", "3 6", "14 3 4 3", "4 2 4 6", "14 2 2 2 2 2",
] as const;

export function CurveKey({ index }: { index: number }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 ${SERIES_COLORS[index % SERIES_COLORS.length]}`} aria-hidden="true">
      <span className="w-5 text-center text-xs font-semibold tabular-nums text-neutral-600 dark:text-neutral-400">{index + 1}</span>
      <svg width="30" height="12" viewBox="0 0 30 12">
        <line x1="0" x2="30" y1="6" y2="6" stroke="currentColor" strokeWidth="2.5" strokeDasharray={SERIES_DASHES[index]} />
      </svg>
    </span>
  );
}

/** Same 0–100% axis for every session; discontinuities remain separate paths. */
export function ChargeComparisonChart({
  series,
  title,
  description,
  socLabel,
  powerLabel,
}: {
  series: ComparisonSeries[];
  title: string;
  description: string;
  socLabel: string;
  powerLabel: string;
}) {
  const width = 640;
  const height = 300;
  const padding = { left: 64, right: 24, top: 22, bottom: 38 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const peak = series.reduce((maximum, session) => session.segments.reduce(
    (sessionMaximum, segment) => segment.reduce((pointMaximum, point) => Math.max(pointMaximum, point.powerKw), sessionMaximum),
    maximum,
  ), 0);
  const maxPower = Math.max(50, Math.ceil(peak / 50) * 50);
  const toX = (soc: number) => padding.left + soc / 100 * innerWidth;
  const toY = (powerKw: number) => padding.top + (1 - powerKw / maxPower) * innerHeight;
  const axisClass = "fill-neutral-500 text-[26px] sm:text-[13px] dark:fill-neutral-400";

  return (
    <figure>
      <div className="flex justify-between text-xs font-medium text-neutral-500 dark:text-neutral-400" aria-hidden="true">
        <span>{powerLabel}</span>
        <span>{socLabel}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-1 h-auto w-full" role="img" aria-labelledby="charge-comparison-title" aria-describedby="charge-comparison-description">
        <title id="charge-comparison-title">{title}</title>
        <desc id="charge-comparison-description">{description}</desc>
        {[0, 0.5, 1].map((fraction) => (
          <g key={fraction}>
            <line x1={padding.left} x2={width - padding.right} y1={toY(fraction * maxPower)} y2={toY(fraction * maxPower)} className="stroke-neutral-200 dark:stroke-neutral-700" />
            <text x={padding.left - 10} y={toY(fraction * maxPower)} textAnchor="end" dominantBaseline="middle" className={axisClass}>{Math.round(fraction * maxPower)}</text>
          </g>
        ))}
        {[0, 20, 40, 60, 80, 100].map((soc) => (
          <text key={soc} x={toX(soc)} y={height - 8} textAnchor="middle" className={axisClass}>{soc}</text>
        ))}
        {series.map((session, index) => (
            <g key={session.id} className={SERIES_COLORS[index % SERIES_COLORS.length]}>
              <title>{`${index + 1}. ${session.label}`}</title>
              {session.segments.map((segment, segmentIndex) => segment.length === 1 ? (
                <circle key={segmentIndex} cx={toX(segment[0]!.soc)} cy={toY(segment[0]!.powerKw)} r={3} fill="currentColor" />
              ) : (
                <path key={segmentIndex} d={segment.map((point, pointIndex) => `${pointIndex === 0 ? "M" : "L"}${toX(point.soc).toFixed(1)},${toY(point.powerKw).toFixed(1)}`).join(" ")} fill="none" stroke="currentColor" strokeWidth={2.5} strokeDasharray={SERIES_DASHES[index]} strokeLinecap="round" strokeLinejoin="round" />
              ))}
            </g>
        ))}
      </svg>
    </figure>
  );
}
