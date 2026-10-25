import React from "react";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { validateSession } from "../../../lib/auth/session";
import { getVehicles } from "../../../lib/queries";
import { getBatteryRangeTrend } from "../../../lib/battery";
import { APP_TIMEZONE } from "../../../lib/config";
import { toIntlLocale } from "../../../lib/i18nLocale";
import { VehicleRequiredState } from "../../../components/VehicleRequiredState";
import { buttonClasses } from "../../../components/ui/Button";
import { BatteryRangeChart } from "./BatteryRangeChart";

export const dynamic = "force-dynamic";
const muted = "text-sm text-neutral-500 dark:text-neutral-400";
const panel = "rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900";

export default async function BatteryPage({ searchParams }: {
  searchParams: Promise<{ vehicle?: string | string[] }>;
}) {
  if (!(await validateSession())) redirect("/login");
  const [t, locale, params, vehicles] = await Promise.all([
    getTranslations("battery"), getLocale(), searchParams, getVehicles(),
  ]);
  if (!vehicles.length) return <VehicleRequiredState title={t("title")} subtitle={t("subtitle")} className="mx-auto max-w-4xl" />;
  const selected = vehicles.find((vehicle) => String(vehicle.id) === params.vehicle) ?? vehicles[0]!;
  const trend = await getBatteryRangeTrend(selected.id);
  const intlLocale = toIntlLocale(locale);
  const number = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 1 });
  const signed = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 1, signDisplay: "exceptZero" });
  const date = new Intl.DateTimeFormat(intlLocale, { dateStyle: "medium", timeZone: APP_TIMEZONE });
  const month = (value: string) => new Intl.DateTimeFormat(intlLocale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}-01T12:00:00Z`));
  const range = (value: number | null | undefined) => value == null ? "—" : `${number.format(value)} km`;
  return <div className="mx-auto max-w-4xl">
    <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
    <p className={`mt-1 ${muted}`}>{t("subtitle")}</p>
    <form action="/battery" className="mt-5 flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1 sm:max-w-xs">
        <label htmlFor="battery-vehicle" className="block text-sm font-medium">{t("vehicle")}</label>
        <select id="battery-vehicle" name="vehicle" defaultValue={selected.id} className="mt-1 min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm dark:border-neutral-700 dark:bg-neutral-900">
          {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.displayName}</option>)}
        </select>
      </div>
      <button type="submit" className={buttonClasses()}>{t("showVehicle")}</button>
    </form>
    <p className={`mt-4 ${muted}`}>{t("qualification")}</p>
    <dl className="mt-5 grid divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white sm:grid-cols-3 sm:divide-x sm:divide-y-0 dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="p-4"><dt className={muted}>{t("latestMedian")}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{range(trend.latest?.medianFullRangeKm)}</dd><dd className={`mt-1 ${muted}`}>{trend.latest ? t("monthSamples", { month: month(trend.latest.month), count: trend.latest.sampleCount }) : t("unavailable")}</dd></div>
      <div className="p-4"><dt className={muted}>{t("baseline")}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{range(trend.baseline?.medianFullRangeKm)}</dd><dd className={`mt-1 ${muted}`}>{trend.baseline ? t("monthSamples", { month: month(trend.baseline.month), count: trend.baseline.sampleCount }) : t("unavailable")}</dd></div>
      <div className="p-4"><dt className={muted}>{t("change")}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{trend.changeKm == null ? "—" : `${signed.format(trend.changeKm)} km`}</dd><dd className={`mt-1 ${muted}`}>{trend.changePercent == null ? t("comparisonNeedsData") : t("changePercent", { value: signed.format(trend.changePercent) })}</dd></div>
    </dl>
    <section className={`mt-6 ${panel}`} aria-labelledby="battery-trend-heading">
      <h2 id="battery-trend-heading" className="text-base font-semibold">{t("trend")}</h2>
      <p className={`mt-1 ${muted}`}>{t("trendDescription")}</p>
      {trend.months.length ? <div className="mt-4"><BatteryRangeChart months={trend.months} title={t("chartTitle")} description={t("chartDescription")} locale={intlLocale} /></div> : <p className={`mt-5 border-t border-neutral-200 pt-4 dark:border-neutral-800 ${muted}`}>{t("empty")}</p>}
      <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label={t("tableLabel")}>
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">{t("tableLabel")}</caption>
          <thead className="text-xs text-neutral-500 dark:text-neutral-400"><tr className="border-b border-neutral-200 dark:border-neutral-800">
            <th scope="col" className="py-2 pr-3 text-left font-medium">{t("month")}</th>
            <th scope="col" className="py-2 px-3 text-right font-medium">{t("median")}</th>
            <th scope="col" className="py-2 pl-3 text-right font-medium">{t("samples")}</th>
          </tr></thead>
          <tbody>{trend.months.map((point) => <tr key={point.month} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800">
            <th scope="row" className="py-3 pr-3 text-left font-normal">{month(point.month)}</th>
            <td className="whitespace-nowrap px-3 py-3 text-right">{range(point.medianFullRangeKm)}</td>
            <td className="py-3 pl-3 text-right">{point.sampleCount}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
    <section className="mt-6" aria-labelledby="battery-coverage-heading">
      <h2 id="battery-coverage-heading" className="text-base font-semibold">{t("coverage")}</h2>
      <p className={`mt-2 ${muted}`}>{t("coverageCounts", { used: trend.observationCount, total: trend.completedChargeCount, rejected: trend.rejectedCount })}</p>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
        <div><dt className={muted}>{t("firstData")}</dt><dd className="mt-1">{trend.firstDataAt == null ? "—" : date.format(trend.firstDataAt)}</dd></div>
        <div><dt className={muted}>{t("firstObservation")}</dt><dd className="mt-1">{trend.firstObservationAt == null ? "—" : date.format(trend.firstObservationAt)}</dd></div>
        <div><dt className={muted}>{t("lastObservation")}</dt><dd className="mt-1">{trend.lastObservationAt == null ? "—" : date.format(trend.lastObservationAt)}</dd></div>
      </dl>
    </section>
    <details className={`mt-6 ${panel}`}>
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">{t("method")}</summary>
      <div className={`mt-2 space-y-2 ${muted}`}><p>{t("formula")}</p><p>{t("filter")}</p><p>{t("baselineNote")}</p><p>{t("causes")}</p></div>
    </details>
  </div>;
}
