"use client";
import { Fragment, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export type Locale = "de" | "en";

const COOKIE = "tripatlas_locale";
const ONE_YEAR = 60 * 60 * 24 * 365;

const OPTIONS: { value: Locale; label: string }[] = [
  { value: "de", label: "DE" },
  { value: "en", label: "EN" },
];

function persist(locale: Locale) {
  document.cookie = `${COOKIE}=${locale}; path=/; max-age=${ONE_YEAR}; SameSite=Lax`;
}

/**
 * Sprachumschalter DE/EN. Schreibt die Wahl in das Cookie `tripatlas_locale`
 * (SSR liest sie in der next-intl Request-Config) und triggert `router.refresh()`,
 * damit der Server mit der neuen Sprache neu rendert. Kein Locale-Routing —
 * die URL bleibt unverändert.
 *
 * `variant="segmented"` — Segment-Control für die Desktop-Sidebar (Optik wie ThemeToggle).
 * `variant="compact"`   — einzelner Button, der zwischen DE/EN umschaltet (Mobile-Header).
 * `variant="inline"`    — dezente Textumschaltung, z. B. unter dem Login-Formular.
 */
export function LocaleSwitcher({
  initial = "de",
  variant = "segmented",
}: {
  initial?: Locale;
  variant?: "segmented" | "compact" | "inline";
}) {
  const router = useRouter();
  const t = useTranslations("ui");
  const [locale, setLocale] = useState<Locale>(initial);

  const select = useCallback(
    (next: Locale) => {
      if (next === locale) return;
      setLocale(next);
      persist(next);
      router.refresh();
    },
    [locale, router],
  );

  if (variant === "compact") {
    const other: Locale = locale === "de" ? "en" : "de";
    return (
      <button
        type="button"
        onClick={() => select(other)}
        aria-label={t("language.switchAriaLabel", {
          current: locale.toUpperCase(),
          next: other.toUpperCase(),
        })}
        title={t("language.currentTitle", { current: locale.toUpperCase() })}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-xs font-semibold text-neutral-500 transition-colors hover:bg-violet-100 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-neutral-400 dark:hover:bg-violet-950 dark:hover:text-violet-300 dark:focus-visible:ring-cyan-300 dark:focus-visible:ring-offset-neutral-950"
      >
        {locale.toUpperCase()}
      </button>
    );
  }

  if (variant === "inline") {
    return (
      <div className="flex items-center justify-center gap-2 text-xs">
        {OPTIONS.map((o, i) => {
          const active = locale === o.value;
          return (
            <Fragment key={o.value}>
              {i > 0 && (
                <span
                  aria-hidden
                  className="text-neutral-300 dark:text-neutral-700"
                >
                  ·
                </span>
              )}
              <button
                type="button"
                onClick={() => select(o.value)}
                aria-pressed={active}
                className={`rounded font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-cyan-300 dark:focus-visible:ring-offset-neutral-950 ${
                  active
                    ? "text-neutral-900 dark:text-neutral-100"
                    : "text-neutral-400 hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-300"
                }`}
              >
                {o.label}
              </button>
            </Fragment>
          );
        })}
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label={t("language.groupLabel")}
      className="inline-flex w-full gap-1 rounded-lg border border-neutral-200 p-1 dark:border-neutral-800"
    >
      {OPTIONS.map((o) => {
        const active = locale === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => select(o.value)}
            aria-pressed={active}
            title={o.label}
            className={`inline-flex flex-1 items-center justify-center rounded-md px-2 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-cyan-300 dark:focus-visible:ring-offset-neutral-950 ${
              active
                ? "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
                : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
