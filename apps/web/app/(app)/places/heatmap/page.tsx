import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { validateSession } from "../../../../lib/auth/session";
import { getVehicles } from "../../../../lib/queries";
import { getInsightYears, getYearlyInsights } from "../../../../lib/yearlyInsights";
import { parseYearlyFilters } from "../../../../lib/yearlyFilters";
import { VehicleRequiredState } from "../../../../components/VehicleRequiredState";
import { YearlyFilters } from "../../../../components/YearlyFilters";
import { YearlyDestinations } from "../../../../components/YearlyDestinations";

export const dynamic = "force-dynamic";

export default async function DestinationHeatmapPage({ searchParams }: {
  searchParams: Promise<{ year?: string | string[]; classification?: string | string[] }>;
}) {
  if (!(await validateSession())) redirect("/login");
  const [t, locale, params] = await Promise.all([getTranslations("yearly"), getLocale(), searchParams]);
  const { year, classification } = parseYearlyFilters(params);
  const vehicles = await getVehicles();
  const vehicleId = vehicles[0]?.id;
  if (vehicleId == null) return <VehicleRequiredState title={t("heatmap.title")} subtitle={t("heatmap.subtitle")} />;
  const [analysis, years] = await Promise.all([getYearlyInsights(vehicleId, year, classification), getInsightYears(vehicleId)]);

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/places" className="inline-flex min-h-11 items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"><ChevronLeft aria-hidden size={16} />{t("heatmap.back")}</Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t("heatmap.title")}</h1>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{t("heatmap.subtitle")}</p>
      <div className="mt-5"><YearlyFilters action="/places/heatmap" year={year} classification={classification} years={years} /></div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">{year} · {t(`classifications.${classification}`)} · {t("driveCount", { count: analysis.totals.driveCount })}</p>
        <Link href={`/wrapped?year=${year}&classification=${classification}`} className="inline-flex min-h-11 items-center text-sm font-medium text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-400">{t("heatmap.toWrapped")}</Link>
      </div>
      <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"><YearlyDestinations analysis={analysis} locale={locale} /></div>
    </div>
  );
}
