import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, Zap } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { validateSession } from "../../../../lib/auth/session";
import { getChargeAnalysis } from "../../../../lib/chargeAnalysis";
import { getVehicles } from "../../../../lib/queries";
import { APP_TIMEZONE } from "../../../../lib/config";
import { toIntlLocale } from "../../../../lib/i18nLocale";
import { VehicleRequiredState } from "../../../../components/VehicleRequiredState";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { ChargeComparisonChart, CurveKey } from "./ChargeComparisonChart";

export const dynamic = "force-dynamic";

const cardClass = "rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900";
const mutedClass = "text-sm text-neutral-500 dark:text-neutral-400";

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className={cardClass}>
      <dt className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
      {detail && <dd className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{detail}</dd>}
    </div>
  );
}

/** Next 15 searchParams is async: https://nextjs.org/docs/15/app/api-reference/file-conventions/page */
export default async function ChargeAnalysisPage({ searchParams }: {
  searchParams: Promise<{ count?: string | string[] }>;
}) {
  // Protect the data read here as well as the surrounding app layout.
  if (!(await validateSession())) redirect("/login");

  const [t, locale, params] = await Promise.all([
    getTranslations("charges"),
    getLocale(),
    searchParams,
  ]);
  const count = params.count === "10" ? 10 : 5;
  const vehicles = await getVehicles();
  const vehicleId = vehicles[0]?.id;
  if (vehicleId == null) {
    return <VehicleRequiredState title={t("analysis.title")} subtitle={t("analysis.subtitle")} className="mx-auto max-w-4xl" />;
  }

  const analysis = await getChargeAnalysis(vehicleId, count);
  const number = new Intl.NumberFormat(toIntlLocale(locale), { maximumFractionDigits: 1 });
  const date = new Intl.DateTimeFormat(toIntlLocale(locale), {
    dateStyle: "medium", timeStyle: "short", timeZone: APP_TIMEZONE,
  });
  const minutes = (value: number) => t("analysis.minutes", { value: number.format(value) });
  const power = (value: number | null) => value == null ? t("analysis.unavailable") : `${number.format(value)} kW`;
  const location = (placeName: string | null, address: string | null) => placeName?.trim() || address?.trim() || t("analysis.unknownLocation");
  const series = analysis.sessions.map((session) => ({
    id: session.id,
    label: `${date.format(session.startTime)} · ${location(session.placeName, session.address)}`,
    segments: session.curveSegments,
  }));
  const curveCount = series.filter((session) => session.segments.some((segment) => segment.length >= 2)).length;
  const powerCount = analysis.sessions.filter((session) => session.averagePowerKw != null).length;

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/charges" className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white">
        <ChevronLeft aria-hidden size={16} />
        {t("analysis.back")}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{t("analysis.title")}</h1>
      <p className={`mt-1 ${mutedClass}`}>{t("analysis.subtitle")}</p>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label={t("analysis.selectorLabel")} className="inline-flex gap-1 rounded-lg border border-neutral-200 p-1 dark:border-neutral-800">
          {([5, 10] as const).map((limit) => (
            <Link key={limit} href={`/charges/analysis?count=${limit}`} aria-current={count === limit ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-md px-4 py-2 text-sm font-medium transition ${count === limit ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900" : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"}`}>
              {t("analysis.lastSessions", { count: limit })}
            </Link>
          ))}
        </nav>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">{t("analysis.selectedCount", { count: analysis.summary.sessionCount })}</p>
      </div>

      {analysis.sessions.length === 0 ? (
        <EmptyState icon={Zap} title={t("analysis.empty.title")} hint={t("analysis.empty.hint")} className="mt-6" />
      ) : (
        <>
          <dl className="mt-5 grid gap-3 sm:grid-cols-3">
            <Metric label={t("analysis.summary.timing")} value={analysis.summary.medianTenToEightyMinutes == null ? t("analysis.unavailable") : minutes(analysis.summary.medianTenToEightyMinutes)} detail={t("analysis.completeTimings", { count: analysis.summary.timingSessionCount })} />
            <Metric label={t("analysis.summary.averagePower")} value={power(analysis.summary.medianAveragePowerKw)} detail={t("analysis.summary.powerCount", { count: powerCount })} />
            <Metric label={t("analysis.summary.peakPower")} value={power(analysis.summary.peakPowerKw)} detail={t("analysis.summary.peakDetail")} />
          </dl>

          <section className={`mt-6 ${cardClass}`} aria-labelledby="charge-curves-heading">
            <h2 id="charge-curves-heading" className="text-base font-semibold">{t("analysis.curves.title")}</h2>
            <p className={`mt-1 ${mutedClass}`}>{t("analysis.curves.subtitle")}</p>
            <div className="mt-4">
              {curveCount > 0 ? (
                <ChargeComparisonChart series={series} title={t("analysis.curves.chartTitle")} description={t("analysis.curves.chartDescription")} socLabel={t("analysis.curves.socAxis")} powerLabel={t("analysis.curves.powerAxis")} />
              ) : <p className={mutedClass}>{t("analysis.curves.noData")}</p>}
            </div>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2" aria-label={t("analysis.curves.legend")}>
              {series.map((session, index) => (
                <li key={session.id} className="flex min-w-0 items-start gap-2 text-xs">
                  <CurveKey index={index} />
                  <div className="min-w-0">
                    <Link href={`/charges/${session.id}`} className="break-words underline-offset-4 hover:underline">
                      <span className="sr-only">{t("analysis.sessionNumber", { count: index + 1 })}: </span>{session.label}
                    </Link>
                    {session.segments.length === 0 && <p className="mt-0.5 text-neutral-500 dark:text-neutral-400">{t("analysis.curves.sessionUnavailable")}</p>}
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">{t("analysis.curves.availableCount", { count: curveCount, total: series.length })}</p>
          </section>

          <section className="mt-6" aria-labelledby="charge-sessions-heading">
            <h2 id="charge-sessions-heading" className="text-base font-semibold">{t("analysis.sessions.title")}</h2>
            <div className="mt-3 space-y-3">
              {analysis.sessions.map((session, index) => {
                const curvePoints = session.curveSegments.flat();
                // The text alternative uses actual recorded values, capped for long sessions.
                const sampleIndices = new Set(Array.from({ length: Math.min(20, curvePoints.length) }, (_, i) => Math.round(i * (curvePoints.length - 1) / Math.max(1, Math.min(20, curvePoints.length) - 1))));
                const samples = curvePoints.filter((_, pointIndex) => sampleIndices.has(pointIndex));
                const timingReason = session.tenToEighty.reason;
                return (
                  <article key={session.id} className={cardClass}>
                    <div className="flex items-start gap-2">
                      <CurveKey index={index} />
                      <h3 className="min-w-0 text-sm font-medium">
                        <Link href={`/charges/${session.id}`} className="block min-h-11 break-words underline-offset-4 hover:underline">
                          <span className="sr-only">{t("analysis.sessionNumber", { count: index + 1 })}: </span>
                          <span className="block text-xs text-neutral-500 dark:text-neutral-400">{date.format(session.startTime)}</span>
                          {location(session.placeName, session.address)}
                        </Link>
                      </h3>
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                      <div>
                        <dt className="text-xs text-neutral-500 dark:text-neutral-400">{t("analysis.sessions.timing")}</dt>
                        <dd className="mt-0.5 text-sm font-medium tabular-nums">{session.tenToEighty.minutes == null ? t("analysis.unavailable") : minutes(session.tenToEighty.minutes)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-neutral-500 dark:text-neutral-400">{t("analysis.sessions.averagePower")}</dt>
                        <dd className="mt-0.5 text-sm font-medium tabular-nums">{power(session.averagePowerKw)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-neutral-500 dark:text-neutral-400">{t("analysis.sessions.peakPower")}</dt>
                        <dd className="mt-0.5 text-sm font-medium tabular-nums">{power(session.peakPowerKw)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-neutral-500 dark:text-neutral-400">{t("analysis.sessions.outsideTemperature")}</dt>
                        <dd className="mt-0.5 text-sm font-medium tabular-nums">{session.outsideTempAvg == null ? t("analysis.unavailable") : `${number.format(session.outsideTempAvg)} °C`}</dd>
                      </div>
                    </dl>
                    {timingReason && <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">{t(`analysis.timingReasons.${timingReason}`)}</p>}
                    <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                      {session.averagePowerKw == null ? t("analysis.sessions.noPower") : t("analysis.sessions.coverage", { minutes: number.format(session.observedPowerMinutes), percent: number.format(session.powerCoveragePercent) })}
                    </p>
                    {session.slowHint && (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                        <p className="font-medium">{t("analysis.slow.title")}</p>
                        <p className="mt-1">{t("analysis.slow.comparison", { count: session.slowHint.peerCount, median: minutes(session.slowHint.peerMedianMinutes), minutes: minutes(session.slowHint.slowerMinutes), percent: number.format(session.slowHint.slowerPercent) })}</p>
                        <p className="mt-1">{session.slowHint.temperatureMatched ? t("analysis.slow.temperatureMatched") : t("analysis.slow.temperatureUnused")}</p>
                        <p className="mt-1">{t("analysis.slow.qualification")}</p>
                      </div>
                    )}
                    {samples.length > 0 && (
                      <details className="mt-3">
                        <summary className="min-h-11 cursor-pointer py-3 text-xs font-medium underline-offset-4 hover:underline">{t("analysis.samples.title")}</summary>
                        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">{t("analysis.samples.description", { count: samples.length, total: curvePoints.length })}</p>
                        <table className="mt-2 w-full text-left text-xs tabular-nums">
                          <caption className="sr-only">{t("analysis.samples.caption", { session: series[index]!.label })}</caption>
                          <thead><tr className="border-b border-neutral-200 dark:border-neutral-800">
                            <th scope="col" className="py-2 pr-2 font-medium">{t("analysis.samples.elapsed")}</th>
                            <th scope="col" className="py-2 pr-2 font-medium">{t("analysis.curves.socAxis")}</th>
                            <th scope="col" className="py-2 font-medium">{t("analysis.curves.powerAxis")}</th>
                          </tr></thead>
                          <tbody>{samples.map((point) => <tr key={`${point.ts}-${point.soc}`} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800">
                            <td className="py-1.5 pr-2">{minutes(point.elapsedMinutes)}</td>
                            <td className="py-1.5 pr-2">{number.format(point.soc)} %</td>
                            <td className="py-1.5">{power(point.powerKw)}</td>
                          </tr>)}</tbody>
                        </table>
                      </details>
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          <section className={`mt-6 ${cardClass}`} aria-labelledby="charge-locations-heading">
            <h2 id="charge-locations-heading" className="text-base font-semibold">{t("analysis.locations.title")}</h2>
            <p className={`mt-1 ${mutedClass}`}>{t("analysis.locations.description")}</p>
            {analysis.locations.length === 0 ? <p className={`mt-3 ${mutedClass}`}>{t("analysis.locations.empty")}</p> : (
              <ol className="mt-4 divide-y divide-neutral-200 dark:divide-neutral-800">
                {analysis.locations.map((place, index) => (
                  <li key={place.key} className="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1 basis-44">
                      <p className="break-words text-sm font-medium">{place.rankingEligible && <span className="mr-2 text-neutral-500 dark:text-neutral-400">{index + 1}.</span>}{location(place.placeName, place.address)}</p>
                      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{t("analysis.locations.samples", { sessions: place.sessionCount, timings: place.timingSessionCount })}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium tabular-nums">{place.medianTenToEightyMinutes == null ? t("analysis.unavailable") : minutes(place.medianTenToEightyMinutes)}</p>
                      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{place.rankingEligible ? t("analysis.locations.median") : place.key === "unknown" ? t("analysis.locations.unknown") : t("analysis.locations.unranked")}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <details className={`mt-6 ${cardClass}`}>
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">{t("analysis.method.title")}</summary>
            <div className={`mt-3 space-y-2 ${mutedClass}`}>
              <p>{t("analysis.method.selection")}</p>
              <p>{t("analysis.method.timing")}</p>
              <p>{t("analysis.method.power")}</p>
              <p>{t("analysis.method.median")}</p>
              <p>{t("analysis.method.slow")}</p>
              <p>{t("analysis.method.temperature")}</p>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
