"use client";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Classification } from "@odovi/core";
import type { Vehicle } from "../../../lib/queries";
import { buttonClasses } from "../../../components/ui/Button";

const CLASSIFICATION_VALUES: Classification[] = [
  "business",
  "private",
  "commute",
  "unclassified",
];

const TYPE_VALUES: Array<"drives" | "charges" | "all"> = ["drives", "charges", "all"];

export function SearchControls({
  q,
  from,
  to,
  classifications,
  type,
  vehicle,
  vehicles,
  children,
  failed,
}: {
  q: string;
  from: string;
  to: string;
  classifications: Classification[];
  type: "drives" | "charges" | "all";
  vehicle?: Vehicle;
  vehicles: Vehicle[];
  children: ReactNode;
  failed: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("search");
  const tc = useTranslations("common");
  const [qInput, setQInput] = useState(q);
  const [pending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep local input in sync if the URL changes from elsewhere (e.g. back/forward nav).
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQInput(q);
  }, [q]);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  function pushParams(next: Record<string, string | null>) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const params = new URLSearchParams(searchParams.toString());
    if (!("q" in next) && qInput !== q) params.set("q", qInput);
    for (const [key, value] of Object.entries(next)) {
      if (value == null || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    // Keep focus/scroll while Next commits controls and results together.
    // https://nextjs.org/docs/15/app/api-reference/functions/use-router#disabling-scroll-to-top
    startTransition(() => router.replace(`/search?${params.toString()}`, { scroll: false }));
  }

  function onQChange(value: string) {
    setQInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      pushParams({ q: value });
    }, 400);
  }

  function toggleClassification(value: Classification) {
    const isSelected = classifications.includes(value);
    const next = isSelected
      ? classifications.filter((c) => c !== value)
      : [...classifications, value];
    pushParams({ classification: next.length > 0 ? next.join(",") : null });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-neutral-600 dark:text-neutral-300" data-testid="search-scope">
        {t("scope", { vehicle: vehicle?.displayName ?? t("noVehicle"), type: t(`type.${type}`) })}
        {(from || to) && ` · ${from || "…"} – ${to || "…"}`}
      </p>
      {vehicles.length > 1 && <select aria-label={t("vehicle")} value={vehicle?.id ?? ""} onChange={(e) => pushParams({ vehicle: e.target.value })}
        className="min-h-11 rounded-lg border border-neutral-300 px-3 text-base dark:border-neutral-700 dark:bg-neutral-900">
        {!vehicle && <option value="" disabled>{t("noVehicle")}</option>}
        {vehicles.map((v) => <option key={v.id} value={v.id}>{v.displayName}</option>)}
      </select>}
      <input
        type="search"
        value={qInput}
        onChange={(e) => onQChange(e.target.value)}
        placeholder={t("placeholder")}
        aria-label={t("title")}
        className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900 shadow-sm focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-center gap-4">
          <div className="flex min-w-0 max-w-full items-center gap-2">
          <label
            htmlFor="search-from"
            className="text-xs font-medium text-neutral-500 dark:text-neutral-400"
          >
            {t("from")}
          </label>
          <input
            id="search-from"
            type="date"
            value={from}
            onChange={(e) => pushParams({ from: e.target.value })}
            className="min-h-11 min-w-0 max-w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-base text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          />
          </div>
          <div className="flex min-w-0 max-w-full items-center gap-2">
          <label
            htmlFor="search-to"
            className="text-xs font-medium text-neutral-500 dark:text-neutral-400"
          >
            {t("to")}
          </label>
          <input
            id="search-to"
            type="date"
            value={to}
            onChange={(e) => pushParams({ to: e.target.value })}
            className="min-h-11 min-w-0 max-w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-base text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {CLASSIFICATION_VALUES.map((value) => {
            const active = classifications.includes(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggleClassification(value)}
                aria-pressed={active}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  active
                    ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                    : "border-neutral-300 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                }`}
              >
                {tc(`classification.${value}`)}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-neutral-300 p-0.5 dark:border-neutral-700">
          {TYPE_VALUES.map((value) => {
            const active = type === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => pushParams({ type: value })}
                aria-pressed={active}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  active
                    ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                    : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                }`}
              >
                {t(`type.${value}`)}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-2" aria-label={t("activeFilters")}>
        {q && <button className={buttonClasses("secondary", "sm", "max-w-full whitespace-normal text-left [overflow-wrap:anywhere]")} onClick={() => { setQInput(""); pushParams({ q: null }); }}>{t("remove", { filter: q })}</button>}
        {from && <button className={buttonClasses("secondary", "sm")} onClick={() => pushParams({ from: null })}>{t("remove", { filter: `${t("from")} ${from}` })}</button>}
        {to && <button className={buttonClasses("secondary", "sm")} onClick={() => pushParams({ to: null })}>{t("remove", { filter: `${t("to")} ${to}` })}</button>}
        {classifications.map((value) => <button key={value} className={buttonClasses("secondary", "sm")} onClick={() => toggleClassification(value)}>{t("remove", { filter: tc(`classification.${value}`) })}</button>)}
        <button type="button" className={buttonClasses("ghost", "sm")} onClick={() => {
          setQInput(""); pushParams({ q: null, from: null, to: null, classification: null, type: "drives" });
        }}>{t("reset")}</button>
      </div>
      <p role="status" className="min-h-5 text-sm text-neutral-600 dark:text-neutral-300">
        {(pending || qInput !== q) ? t("updating") : ""}
      </p>
      {failed && <button className={buttonClasses("secondary")} onClick={() => startTransition(() => router.refresh())}>{t("retry")}</button>}
      <div aria-busy={pending || qInput !== q} data-testid="search-results">{children}</div>
    </div>
  );
}
