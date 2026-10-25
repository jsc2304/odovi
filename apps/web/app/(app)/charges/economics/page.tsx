import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { ChargingEconomicsSummary } from "@odovi/core";
import { validateSession } from "../../../../lib/auth/session";
import { getVehicles } from "../../../../lib/queries";
import { getChargingEconomics, parseEconomicsMonth, shiftEconomicsMonth } from "../../../../lib/chargingEconomics";
import { APP_TIMEZONE } from "../../../../lib/config";
import { toIntlLocale } from "../../../../lib/i18nLocale";
import { VehicleRequiredState } from "../../../../components/VehicleRequiredState";

export const dynamic = "force-dynamic";
const muted = "text-xs text-neutral-500 dark:text-neutral-400";
const control = "max-w-full min-w-0 min-h-11 rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700";
const frame = "border-t border-neutral-200 py-5 dark:border-neutral-800";
type Params = { vehicle?: string | string[]; month?: string | string[] };

export default async function ChargingEconomicsPage({ searchParams }: { searchParams: Promise<Params> }) {
  if (!(await validateSession())) redirect("/login");
  const [t, locale, params, vehicles] = await Promise.all([
    getTranslations("chargingEconomics"), getLocale(), searchParams, getVehicles(),
  ]);
  if (!vehicles.length) return <VehicleRequiredState title={t("title")} subtitle={t("subtitle")} />;
  const requested = typeof params.vehicle === "string" && /^\d+$/.test(params.vehicle) ? Number(params.vehicle) : NaN;
  const vehicle = vehicles.find((entry) => entry.id === requested) ?? vehicles[0]!;
  const month = parseEconomicsMonth(params.month);
  const report = await getChargingEconomics(vehicle.id, month);
  const number = new Intl.NumberFormat(toIntlLocale(locale), { maximumFractionDigits: 1 });
  const money = new Intl.NumberFormat(toIntlLocale(locale), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const price = new Intl.NumberFormat(toIntlLocale(locale), { minimumFractionDigits: 2, maximumFractionDigits: 3 });
  const period = new Intl.DateTimeFormat(toIntlLocale(locale), { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-15T12:00:00Z`));
  const link = (value: string) => `/charges/economics?vehicle=${vehicle.id}&month=${value}`;
  const energy = (value: number, count: number) => count ? `${number.format(value)} kWh` : t("unavailable");

  function summaryView(summary: ChargingEconomicsSummary, compact = false) {
    return <div>
      <dl className={`grid grid-cols-2 gap-x-5 gap-y-4 ${compact ? "lg:grid-cols-4" : "sm:grid-cols-4"}`}>
        {[
          [t("added"), energy(summary.addedKwh, summary.addedCount), t("coverage", { count: summary.addedCount, total: summary.sessionCount })],
          [t("drawn"), energy(summary.drawnKwh, summary.drawnCount), t("coverage", { count: summary.drawnCount, total: summary.sessionCount })],
          [t("efficiency"), summary.efficiency === null ? t("unavailable") : `${number.format(summary.efficiency * 100)} %`, t("coverage", { count: summary.pairedCount, total: summary.sessionCount })],
          [t("loss"), summary.lossKwh === null ? t("unavailable") : `${number.format(summary.lossKwh)} kWh`, t("pairEnergy", { added: number.format(summary.pairedAddedKwh), drawn: number.format(summary.pairedDrawnKwh) })],
        ].map(([label, value, detail]) => <div key={label} className="min-w-0"><dt className={muted}>{label}</dt><dd className={`${compact ? "text-lg" : "text-2xl"} mt-1 font-medium tabular-nums`}>{value}</dd><dd className={`mt-1 ${muted}`}>{detail}</dd></div>)}
      </dl>
      <p className={`mt-4 ${muted}`}>{t("sessionCoverage", { total: summary.sessionCount, priced: summary.pricedCount, missing: summary.sessionCount - summary.pricedCount, excluded: summary.inconsistentCount })}</p>
      {summary.costs.length === 0 ? <p className={`mt-3 ${muted}`}>{t("noPrices")}</p> : <ul className="mt-3 divide-y divide-neutral-200 dark:divide-neutral-800">
        {summary.costs.map((cost) => <li key={cost.currency ?? "unknown"} className="py-3 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-sm font-medium">{cost.currency ?? t("unknownCurrency")}</p><p className="text-base font-medium tabular-nums">{money.format(Number(cost.total))} <span className={muted}>{t("pricedSessions", { count: cost.sessionCount })}</span></p></div>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            {(["added", "drawn"] as const).map((kind) => <div key={kind}>
              <dt className={muted}>{t(kind === "added" ? "perAdded" : "perDrawn")}</dt>
              <dd className="mt-1 text-sm tabular-nums">{cost[kind].perKwh === null ? t("unavailable") : `${price.format(cost[kind].perKwh!)} ${cost.currency}/kWh`}</dd>
              <dd className={`mt-1 ${muted}`}>{t("matched", { cost: money.format(Number(cost[kind].cost)), currency: cost.currency ?? t("unknownCurrency"), energy: number.format(cost[kind].energyKwh), count: cost[kind].sessionCount, total: summary.sessionCount })}</dd>
            </div>)}
          </dl>
        </li>)}
      </ul>}
    </div>;
  }

  return <div className="mx-auto max-w-5xl" data-charging-economics>
    <Link href="/charges" className="inline-flex min-h-11 items-center text-sm text-neutral-500 underline-offset-4 hover:underline dark:text-neutral-400">{t("back")}</Link>
    <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t("title")}</h1>
    <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{t("subtitle")}</p>
    <form action="/charges/economics" method="get" aria-label={t("filters")} className="my-5 flex flex-wrap items-end gap-3">
      <label className="grid max-w-full min-w-0 gap-1 text-sm">{t("vehicle")}<select className={control} name="vehicle" defaultValue={vehicle.id}>{vehicles.map((entry) => <option key={entry.id} value={entry.id}>{entry.displayName}</option>)}</select></label>
      <label className="grid max-w-full min-w-0 gap-1 text-sm">{t("month")}<input className={control} type="month" name="month" min="1970-01" max="9999-12" defaultValue={month} required /></label>
      <button className={control} type="submit">{t("apply")}</button>
    </form>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="min-w-0 break-words text-base font-semibold">{period} · {vehicle.displayName}</h2>
      <nav aria-label={t("monthNavigation")} className="flex flex-wrap gap-3 text-sm">
        {month > "1970-01" && <Link className="inline-flex min-h-11 items-center underline-offset-4 hover:underline" href={link(shiftEconomicsMonth(month, -1))}>{t("previous")}</Link>}
        {month < "9999-12" && <Link className="inline-flex min-h-11 items-center underline-offset-4 hover:underline" href={link(shiftEconomicsMonth(month, 1))}>{t("next")}</Link>}
      </nav>
    </div>
    <p className={`mb-4 ${muted}`}>{t("period", { timezone: APP_TIMEZONE })}</p>
    <section aria-label={t("overview")} className={frame}>
      {!report.total.sessionCount && <p className="mb-5 text-sm">{t("empty")}</p>}
      {summaryView(report.total)}
    </section>
    <div className="grid gap-x-8 lg:grid-cols-2">
      <section aria-labelledby="charging-sources" className={frame}>
        <h2 id="charging-sources" className="text-base font-semibold">{t("sources")}</h2>
        {report.sources.length === 0 && <p className={`mt-3 ${muted}`}>{t("empty")}</p>}
        {report.sources.map((source) => <details key={source.key} className="mt-4 border-t border-neutral-200 pt-2 dark:border-neutral-800">
          <summary className="min-h-11 cursor-pointer py-3 text-sm"><span className="font-semibold">{t(`source.${source.key}`)}</span><span className={`ml-2 ${muted}`}>{t("groupSummary", { count: source.summary.sessionCount, energy: energy(source.summary.addedKwh, source.summary.addedCount) })}</span></summary>
          <div className="py-3">{summaryView(source.summary, true)}</div>
        </details>)}
      </section>
      <section aria-labelledby="charging-locations" className={frame}>
        <h2 id="charging-locations" className="text-base font-semibold">{t("locations")}</h2>
        <p className={`mt-1 ${muted}`}>{t("notRanked")}</p>
        {report.locations.length === 0 && <p className={`mt-3 ${muted}`}>{t("empty")}</p>}
        {report.locations.map((location) => <details key={location.key} className="mt-4 border-t border-neutral-200 pt-2 dark:border-neutral-800">
          <summary className="min-h-11 cursor-pointer break-words py-3 text-sm"><span className="font-semibold">{location.name ?? t("unknownLocation")}</span><span className={`ml-2 ${muted}`}>{t("groupSummary", { count: location.summary.sessionCount, energy: energy(location.summary.addedKwh, location.summary.addedCount) })}</span></summary>
          <div className="py-3">{summaryView(location.summary, true)}</div>
        </details>)}
      </section>
    </div>
    <section className={frame} aria-labelledby="charging-method">
      <h2 id="charging-method" className="text-base font-semibold">{t("methodTitle")}</h2>
      <div className="mt-3 space-y-2 text-sm text-neutral-500 dark:text-neutral-400"><p>{t("methodEnergy")}</p><p>{t("methodPrice")}</p><p>{t("methodSource")}</p></div>
    </section>
  </div>;
}
