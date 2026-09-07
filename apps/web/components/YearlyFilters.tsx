import React from "react";
import { getTranslations } from "next-intl/server";
import type { YearlyClassificationFilter } from "@odovi/core";

export async function YearlyFilters({ action, year, classification, years }: {
  action: "/places/heatmap" | "/wrapped";
  year: number;
  classification: YearlyClassificationFilter;
  years: number[];
}) {
  const t = await getTranslations("yearly");
  const options = [...new Set([year, ...years])].sort((a, b) => b - a);
  const inputClass = "mt-1 min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100";

  return (
    <form action={action} method="get" className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-end" aria-label={t("filters.label")} data-yearly-filters>
      <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">
        {t("filters.year")}
        <select name="year" defaultValue={year} className={inputClass}>
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">
        {t("filters.classification")}
        <select name="classification" defaultValue={classification} className={inputClass}>
          {(["all", "private", "business", "commute", "unclassified"] as const).map((option) => <option key={option} value={option}>{t(`classifications.${option}`)}</option>)}
        </select>
      </label>
      <button type="submit" className="min-h-11 rounded-lg bg-neutral-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white">{t("filters.apply")}</button>
    </form>
  );
}
