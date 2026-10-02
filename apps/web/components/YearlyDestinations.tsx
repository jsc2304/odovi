import React from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { YearlyInsights } from "@odovi/core";
import { toIntlLocale } from "../lib/i18nLocale";
import { DestinationHeatmapLoader } from "./DestinationHeatmapLoader";

export async function YearlyDestinations({ analysis, locale }: { analysis: YearlyInsights; locale: string }) {
  const t = await getTranslations("yearly");
  const coordinate = new Intl.NumberFormat(toIntlLocale(locale), { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const label = (destination: YearlyInsights["destinations"][number]) => destination.name?.trim() || destination.address?.trim() || (
    destination.lat != null && destination.lon != null
      ? t("destinations.approximate", { lat: coordinate.format(destination.lat), lon: coordinate.format(destination.lon) })
      : t("destinations.unknown")
  );
  const points = analysis.destinations.flatMap((destination) => destination.lat != null && destination.lon != null && Number.isFinite(destination.lat) && Number.isFinite(destination.lon)
    ? [{ key: destination.key, label: label(destination), lat: destination.lat, lon: destination.lon, visits: destination.visitCount }]
    : []);

  return (
    <section aria-labelledby="yearly-destinations-title" data-yearly-destinations>
      <h2 id="yearly-destinations-title" className="text-base font-semibold">{t("destinations.title")}</h2>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{t("destinations.description")}</p>
      <div className="mt-4">
        {points.length > 0 ? <DestinationHeatmapLoader points={points} locale={locale} ariaLabel={t("map.label")} emptyLabel={t("map.empty")} intensityLabel={t("map.intensity")} visitLabels={{ one: t("map.visit"), other: t("map.visits") }} /> : <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">{t("map.empty")}</p>}
      </div>
      <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">{t("destinations.coverage", {
        mapped: analysis.destinationCoverage.mappedDriveCount,
        grouped: analysis.destinationCoverage.groupedDriveCount,
        missing: analysis.destinationCoverage.missingDestinationDriveCount,
      })}</p>
      <h3 className="mt-5 text-sm font-semibold">{t("destinations.topTitle")}</h3>
      {analysis.destinations.length === 0 ? <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">{t("destinations.empty")}</p> : (
        <ol className="mt-2 divide-y divide-neutral-200 dark:divide-neutral-800">
          {analysis.destinations.slice(0, 10).map((destination, index) => (
            <li key={destination.key} className="flex items-center justify-between gap-3 py-3 text-sm">
              <div className="flex min-w-0 items-start gap-2">
                <span className="w-5 shrink-0 text-neutral-400 tabular-nums">{index + 1}.</span>
                <div className="min-w-0">
                  {destination.placeId != null ? <Link href={`/places/${destination.placeId}/edit`} className="inline-flex min-h-11 items-center break-words font-medium underline-offset-4 hover:underline">{label(destination)}</Link> : <p className="break-words font-medium">{label(destination)}</p>}
                  {destination.isHome && <p className="text-xs text-neutral-500 dark:text-neutral-400">{t("destinations.home")}</p>}
                  {destination.lat == null || destination.lon == null ? <p className="text-xs text-neutral-500 dark:text-neutral-400">{t("destinations.noCoordinates")}</p> : null}
                </div>
              </div>
              <span className="shrink-0 text-right text-xs tabular-nums">{t("destinations.visits", { count: destination.visitCount })}</span>
            </li>
          ))}
        </ol>
      )}
      {analysis.destinations.length > 0 && <details className="mt-4" data-destination-data>
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">{t("destinations.allValues")}</summary>
        <div className="max-h-96 overflow-auto overscroll-contain" tabIndex={0} role="region" aria-label={t("destinations.allValues")}>
          <table className="w-full text-left text-xs tabular-nums">
            <caption className="mb-2 text-left">{t("destinations.allCaption", { year: analysis.year, classification: t(`classifications.${analysis.classification}`) })}</caption>
            <thead><tr><th scope="col" className="px-2 py-2">{t("destinations.title")}</th><th scope="col" className="px-2 py-2">{t("map.visits")}</th><th scope="col" className="px-2 py-2">{t("destinations.coordinates")}</th></tr></thead>
            <tbody>{analysis.destinations.map((destination) => <tr key={destination.key} className="border-t border-neutral-200 dark:border-neutral-800">
              <th scope="row" className="break-words px-2 py-2 font-medium">{label(destination)}{destination.isHome && <span className="block font-normal">{t("destinations.home")}</span>}</th>
              <td className="px-2 py-2">{destination.visitCount}</td>
              <td className="px-2 py-2">{destination.lat != null && destination.lon != null ? `${coordinate.format(destination.lat)}, ${coordinate.format(destination.lon)}` : t("destinations.noCoordinates")}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>}
      <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">{t("destinations.grouping")}</p>
    </section>
  );
}
