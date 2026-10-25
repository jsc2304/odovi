import React from "react";
import type { BatteryRangeMonth } from "@odovi/core";

function monthIndex(month: string): number {
  const [year, number] = month.split("-").map(Number);
  return year! * 12 + number! - 1;
}

/** Points are spaced by calendar month; lines never bridge unobserved months. */
export function BatteryRangeChart({ months, title, description, locale }: {
  months: BatteryRangeMonth[];
  title: string;
  description: string;
  locale: string;
}) {
  if (months.length === 0) return null;
  const height = months.length === 1 ? 160 : 220;
  const left = "16%";
  const right = "97%";
  const top = 18;
  const bottom = 40;
  const first = monthIndex(months[0]!.month);
  const last = monthIndex(months.at(-1)!.month);
  const values = months.map((month) => month.medianFullRangeKm);
  // A zero-based scale avoids making small estimate changes look dramatic.
  const max = (Math.floor(Math.max(...values) / 50) + 1) * 50;
  const x = (month: string) => `${first === last ? 56.5 : 16 + (monthIndex(month) - first) / (last - first) * 81}%`;
  const y = (value: number) => top + (1 - value / max) * (height - top - bottom);
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const monthLabel = (month: string) => new Intl.DateTimeFormat(locale, { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));
  const ticks = [0, max / 2, max];
  return (
    <svg width="100%" height={height} className="w-full" role="img" aria-labelledby="battery-range-title" aria-describedby="battery-range-description">
      <title id="battery-range-title">{title}</title>
      <desc id="battery-range-description">{description}</desc>
      {ticks.map((tick) => <g key={tick}>
        <line x1={left} x2={right} y1={y(tick)} y2={y(tick)} className="stroke-neutral-200 dark:stroke-neutral-800" />
        <text x="13%" y={y(tick) + 4} textAnchor="end" className="fill-neutral-500 text-xs dark:fill-neutral-400">{number.format(tick)}</text>
      </g>)}
      <text x="13%" y={top - 7} textAnchor="end" className="fill-neutral-500 text-xs dark:fill-neutral-400">km</text>
      {months.map((month, index) => {
        const previous = months[index - 1];
        return <g key={month.month}>
          {previous && monthIndex(month.month) - monthIndex(previous.month) === 1 && <line
            x1={x(previous.month)} y1={y(previous.medianFullRangeKm)} x2={x(month.month)} y2={y(month.medianFullRangeKm)}
            className="stroke-accent-700 dark:stroke-accent-300" strokeWidth={2} />}
          <circle cx={x(month.month)} cy={y(month.medianFullRangeKm)} r={3.5} className="fill-accent-700 dark:fill-accent-300">
            <title>{`${monthLabel(month.month)}: ${number.format(month.medianFullRangeKm)} km (${month.sampleCount})`}</title>
          </circle>
        </g>;
      })}
      {[months[0]!, ...(months.length > 1 ? [months.at(-1)!] : [])].map((month) => <text key={month.month}
        x={x(month.month)} y={height - 10} textAnchor={months.length === 1 ? "middle" : month === months[0] ? "start" : "end"}
        className="fill-neutral-500 text-xs dark:fill-neutral-400">{monthLabel(month.month)}</text>)}
    </svg>
  );
}
