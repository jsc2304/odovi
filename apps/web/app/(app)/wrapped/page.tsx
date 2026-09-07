import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { validateSession } from "../../../lib/auth/session";
import { getVehicles } from "../../../lib/queries";
import { getInsightYears, getYearlyInsights } from "../../../lib/yearlyInsights";
import { parseYearlyFilters } from "../../../lib/yearlyFilters";
import { toIntlLocale } from "../../../lib/i18nLocale";
import { VehicleRequiredState } from "../../../components/VehicleRequiredState";
import { YearlyFilters } from "../../../components/YearlyFilters";
import { YearlyDestinations } from "../../../components/YearlyDestinations";
import { PrintButton } from "./PrintButton";
import styles from "./Wrapped.module.css";

export const dynamic = "force-dynamic";

const cardClass = "rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900";
const mutedClass = "text-sm text-neutral-500 dark:text-neutral-400";

function Metric({ title, value, children }: { title: string; value: string; children?: React.ReactNode }) {
  return <div className={cardClass} data-yearly-card data-yearly-metric><dt className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{title}</dt><dd className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">{value}</dd>{children && <dd className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">{children}</dd>}</div>;
}

export default async function WrappedPage({ searchParams }: {
  searchParams: Promise<{ year?: string | string[]; classification?: string | string[] }>;
}) {
  if (!(await validateSession())) redirect("/login");
  const [t, locale, params] = await Promise.all([getTranslations("yearly"), getLocale(), searchParams]);
  const { year, classification } = parseYearlyFilters(params);
  const vehicles = await getVehicles();
  const vehicleId = vehicles[0]?.id;
  if (vehicleId == null) return <VehicleRequiredState title={t("wrapped.title", { year })} subtitle={t("wrapped.subtitle")} />;
  const [analysis, years] = await Promise.all([getYearlyInsights(vehicleId, year, classification), getInsightYears(vehicleId)]);
  const number = new Intl.NumberFormat(toIntlLocale(locale), { maximumFractionDigits: 1 });
  const integer = new Intl.NumberFormat(toIntlLocale(locale), { maximumFractionDigits: 0 });
  const coordinate = new Intl.NumberFormat(toIntlLocale(locale), { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const decimalSeparator = number.formatToParts(1.1).find((part) => part.type === "decimal")?.value ?? ".";
  const cost = (value: string) => {
    const [whole, fraction = "00"] = value.replace(/^-/, "").split(".");
    return `${value.startsWith("-") ? "−" : ""}${integer.format(BigInt(whole!))}${decimalSeparator}${fraction.padEnd(2, "0")}`;
  };
  const date = new Intl.DateTimeFormat(toIntlLocale(locale), { dateStyle: "medium", timeZone: analysis.timeZone });
  const month = new Intl.DateTimeFormat(toIntlLocale(locale), { month: "short", timeZone: "UTC" });
  const distance = (value: number) => `${number.format(value)} km`;
  const energy = (value: number) => `${number.format(value)} kWh`;
  const destinationName = (destination: { name: string | null; address: string | null; lat?: number | null; lon?: number | null }) => destination.name?.trim() || destination.address?.trim() || (
    destination.lat != null && destination.lon != null ? t("destinations.approximate", { lat: coordinate.format(destination.lat), lon: coordinate.format(destination.lon) }) : t("destinations.unknown")
  );
  const { totals, charging } = analysis;
  const maxMonthlyDistance = Math.max(0, ...analysis.months.map((entry) => entry.distanceKm));
  const recordValue = (value: number, known: number, format: (value: number) => string) => totals.driveCount > 0 && known === 0 ? t("unavailable") : format(value);

  return (
    <div className={`${styles.report} mx-auto max-w-4xl`} data-wrapped>
      <Link href="/insights" className="inline-flex min-h-11 items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white" data-wrapped-screen-only><ChevronLeft aria-hidden size={16} />{t("wrapped.back")}</Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("wrapped.title", { year })}</h1>
          <p className={`mt-2 ${mutedClass}`}>{t("wrapped.subtitle")}</p>
        </div>
        <PrintButton label={t("wrapped.print")} />
      </div>
      <div className="mt-6"><YearlyFilters action="/wrapped" year={year} classification={classification} years={years} /></div>
      <p className="mt-4 text-sm font-medium" data-wrapped-context>{t("wrapped.scope", { year, classification: t(`classifications.${classification}`) })}</p>
      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{t("wrapped.yearBasis", { timeZone: analysis.timeZone })}</p>
      {totals.driveCount === 0 && <p className={`mt-4 rounded-lg border border-dashed border-neutral-300 p-4 dark:border-neutral-700 ${mutedClass}`}>{t("wrapped.emptyDrives")}</p>}

      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric title={t("totals.distance")} value={recordValue(totals.totalDistanceKm, totals.knownDistanceDriveCount, distance)}>{t("totals.coverage", { known: totals.knownDistanceDriveCount, total: totals.driveCount })}</Metric>
        <Metric title={t("totals.drives")} value={integer.format(totals.driveCount)}>{t("totals.completed")}</Metric>
        <Metric title={t("totals.duration")} value={recordValue(totals.totalDurationSeconds, totals.knownDurationDriveCount, (seconds) => t("totals.hours", { value: number.format(seconds / 3600) }))}>{t("totals.coverage", { known: totals.knownDurationDriveCount, total: totals.driveCount })}</Metric>
        <Metric title={t("totals.energy")} value={recordValue(totals.totalEnergyKwh, totals.knownEnergyDriveCount, energy)}>{t("totals.coverage", { known: totals.knownEnergyDriveCount, total: totals.driveCount })}</Metric>
      </dl>
      <p className={`mt-3 ${mutedClass}`}>{t("totals.consumption", { value: totals.avgConsumptionWhKm == null ? t("unavailable") : `${integer.format(totals.avgConsumptionWhKm)} Wh/km` })}</p>
      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{t("totals.energyQuality", { estimated: totals.estimatedEnergyDriveCount, missing: totals.missingEnergyDriveCount })}</p>

      <section className={`mt-6 ${styles.section} ${cardClass}`} data-yearly-card aria-labelledby="wrapped-highlights-title">
        <h2 id="wrapped-highlights-title" className="text-base font-semibold">{t("highlights.title")}</h2>
        <dl className="mt-4 grid gap-5 sm:grid-cols-3">
          <div><dt className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{t("highlights.longest")}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{analysis.longestDrive ? distance(analysis.longestDrive.distanceKm) : t("unavailable")}</dd>{analysis.longestDrive && <dd><Link href={`/drives/${analysis.longestDrive.id}`} className="inline-flex min-h-11 items-center text-sm text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-400">{t("highlights.openDrive", { date: date.format(analysis.longestDrive.startTime) })}</Link></dd>}</div>
          <div><dt className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{t("highlights.favorite")}</dt><dd className="mt-1 break-words text-lg font-semibold">{analysis.favoriteDestination ? destinationName(analysis.favoriteDestination) : t("unavailable")}</dd>{analysis.favoriteDestination && <dd className={`mt-1 ${mutedClass}`}>{t("destinations.visits", { count: analysis.favoriteDestination.visitCount })}</dd>}<dd className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">{t("highlights.homeExclusion")}</dd></div>
          <div><dt className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{t("highlights.farthest")}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{analysis.farthestDestination ? distance(analysis.farthestDestination.distanceKm) : t("unavailable")}</dd>{analysis.farthestDestination && <dd className={`mt-1 break-words ${mutedClass}`}>{destinationName(analysis.farthestDestination.destination)}</dd>}<dd className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">{analysis.homeReference ? t("highlights.straightLine", { home: analysis.homeReference.name }) : t("highlights.noHome")}</dd></div>
        </dl>
      </section>

      <section className={`mt-6 ${styles.section} ${cardClass}`} data-yearly-card aria-labelledby="wrapped-classifications-title">
        <h2 id="wrapped-classifications-title" className="text-base font-semibold">{t("split.title")}</h2>
        <p className={`mt-1 ${mutedClass}`}>{t("split.description")}</p>
        <table className="mt-4 w-full text-left text-sm"><caption className="sr-only">{t("split.title")}</caption><thead><tr className="border-b border-neutral-200 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400"><th scope="col" className="py-2 pr-2 font-medium">{t("filters.classification")}</th><th scope="col" className="py-2 px-2 text-right font-medium">{t("totals.drives")}</th><th scope="col" className="py-2 pl-2 text-right font-medium">{t("totals.distance")}</th></tr></thead><tbody>
          {analysis.classifications.map((entry) => <tr key={entry.classification} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800"><th scope="row" className="py-3 pr-2 font-normal">{t(`classifications.${entry.classification}`)}</th><td className="px-2 text-right tabular-nums">{integer.format(entry.driveCount)}</td><td className="pl-2 text-right tabular-nums">{entry.driveCount > 0 && entry.knownDistanceDriveCount === 0 ? t("unavailable") : distance(entry.distanceKm)}{entry.missingDistanceDriveCount > 0 && <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">{t("totals.missingDistance", { count: entry.missingDistanceDriveCount })}</span>}</td></tr>)}
        </tbody></table>
      </section>

      <section className={`mt-6 ${styles.section} ${cardClass}`} data-yearly-card aria-labelledby="wrapped-months-title">
        <h2 id="wrapped-months-title" className="text-base font-semibold">{t("months.title")}</h2>
        <p className={`mt-1 ${mutedClass}`}>{t("months.description")}</p>
        <table className="mt-4 w-full text-left text-sm"><caption className="sr-only">{t("months.caption", { year })}</caption><thead><tr className="border-b border-neutral-200 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400"><th scope="col" className="py-2 pr-3 font-medium">{t("months.month")}</th><th scope="col" className="py-2 px-2 text-right font-medium">{t("totals.drives")}</th><th scope="col" className="w-1/2 py-2 pl-4 text-right font-medium">{t("totals.distance")}</th></tr></thead><tbody>
          {analysis.months.map((entry) => <tr key={entry.month} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800"><th scope="row" className="py-2.5 pr-3 font-normal">{month.format(Date.UTC(year, entry.month - 1, 1))}</th><td className="px-2 text-right tabular-nums">{integer.format(entry.driveCount)}</td><td className="py-2.5 pl-4 text-right tabular-nums"><span>{entry.driveCount > 0 && entry.knownDistanceDriveCount === 0 ? t("unavailable") : distance(entry.distanceKm)}</span>{entry.missingDistanceDriveCount > 0 && <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">{t("totals.missingDistance", { count: entry.missingDistanceDriveCount })}</span>}<span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800" aria-hidden="true"><span data-month-bar className="block h-full rounded-full bg-emerald-600 dark:bg-emerald-400" style={{ width: `${maxMonthlyDistance > 0 ? entry.distanceKm / maxMonthlyDistance * 100 : 0}%` }} /></span></td></tr>)}
        </tbody></table>
      </section>

      <div className={`mt-6 ${cardClass}`} data-yearly-card><YearlyDestinations analysis={analysis} locale={locale} /></div>

      <section className={`mt-6 ${styles.section} ${cardClass}`} data-yearly-card aria-labelledby="wrapped-charging-title">
        <h2 id="wrapped-charging-title" className="text-base font-semibold">{t("charging.title")}</h2>
        <p className="mt-1 text-sm font-medium" data-wrapped-charge-scope>{t("charging.scope", { year })}</p>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div><dt className="text-xs text-neutral-500 dark:text-neutral-400">{t("charging.sessions")}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{integer.format(charging.sessionCount)}</dd><dd className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{t("charging.types", { ac: charging.acCount, dc: charging.dcCount, unknown: charging.unknownTypeCount })}</dd></div>
          <div><dt className="text-xs text-neutral-500 dark:text-neutral-400">{t("charging.energy")}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{charging.sessionCount > 0 && charging.knownEnergySessionCount === 0 ? t("unavailable") : energy(charging.energyAddedKwh)}</dd><dd className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{t("charging.energyCoverage", { known: charging.knownEnergySessionCount, total: charging.sessionCount })}</dd></div>
          <div><dt className="text-xs text-neutral-500 dark:text-neutral-400">{t("charging.peak")}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{charging.peakDcPowerKw == null ? t("unavailable") : `${number.format(charging.peakDcPowerKw)} kW`}</dd></div>
        </dl>
        <div className="mt-5"><h3 className="text-sm font-semibold">{t("charging.costs")}</h3><p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{t("charging.costCoverage", { known: charging.knownCostSessionCount, total: charging.sessionCount })}</p>
          {charging.costs.length === 0 ? <p className={`mt-2 ${mutedClass}`}>{t("charging.noCosts")}</p> : <dl className="mt-3 space-y-2">{charging.costs.map((group) => <div key={group.currency ?? "unknown"} className="flex flex-wrap items-baseline justify-between gap-2 text-sm"><dt>{group.currency ?? t("charging.unknownCurrency")} <span className="text-xs text-neutral-500 dark:text-neutral-400">({t("charging.costSessions", { count: group.sessionCount })})</span></dt><dd className="font-medium tabular-nums">{cost(group.total)}{group.currency ? ` ${group.currency}` : ""}</dd></div>)}</dl>}
          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">{t("charging.currencies")}</p>
        </div>
        <div className="mt-5"><h3 className="text-sm font-semibold">{t("charging.favorite")}</h3><p className={`mt-1 break-words ${mutedClass}`}>{charging.favoriteLocation ? `${destinationName(charging.favoriteLocation)} · ${t("charging.costSessions", { count: charging.favoriteLocation.sessionCount })}` : t("unavailable")}</p></div>
      </section>

      <p className="mt-5 text-xs text-neutral-500 dark:text-neutral-400">{t("wrapped.footer")}</p>
    </div>
  );
}
