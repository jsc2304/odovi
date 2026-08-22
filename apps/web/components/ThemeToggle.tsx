"use client";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Sun, Moon, Monitor, type LucideIcon } from "lucide-react";

export type ThemeChoice = "light" | "dark" | "system";

const COOKIE = "tripatlas_theme";
const ONE_YEAR = 60 * 60 * 24 * 365;

const OPTIONS: { value: ThemeChoice; labelKey: "light" | "dark" | "system"; icon: LucideIcon }[] = [
  { value: "light", labelKey: "light", icon: Sun },
  { value: "dark", labelKey: "dark", icon: Moon },
  { value: "system", labelKey: "system", icon: Monitor },
];

function prefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Setzt die .dark-Klasse auf <html> passend zur Wahl. */
function applyTheme(choice: ThemeChoice) {
  const dark = choice === "dark" || (choice === "system" && prefersDark());
  document.documentElement.classList.toggle("dark", dark);
}

function persist(choice: ThemeChoice) {
  document.cookie = `${COOKIE}=${choice}; path=/; max-age=${ONE_YEAR}; SameSite=Lax`;
}

/**
 * Drei-Wege-Theme-Switcher (Hell/Dunkel/System). Schreibt die Wahl in ein
 * Cookie (SSR rendert daraus die Klasse ohne FOUC) und setzt die DOM-Klasse
 * sofort. Im System-Modus wird prefers-color-scheme live verfolgt.
 *
 * `variant="segmented"` — Segment-Control für die Desktop-Sidebar.
 * `variant="compact"`   — einzelner Icon-Button, der die Modi durchtaktet.
 */
export function ThemeToggle({
  initial = "system",
  variant = "segmented",
}: {
  initial?: ThemeChoice;
  variant?: "segmented" | "compact";
}) {
  const [choice, setChoice] = useState<ThemeChoice>(initial);
  const t = useTranslations("ui");

  // Im System-Modus auf Wechsel der Systemeinstellung reagieren.
  useEffect(() => {
    if (choice !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [choice]);

  const select = useCallback((next: ThemeChoice) => {
    setChoice(next);
    persist(next);
    applyTheme(next);
  }, []);

  if (variant === "compact") {
    const found = OPTIONS.findIndex((o) => o.value === choice);
    const idx = found === -1 ? 2 : found;
    const current = OPTIONS[idx];
    const next = OPTIONS[(idx + 1) % OPTIONS.length];
    const Icon = current.icon;
    return (
      <button
        type="button"
        onClick={() => select(next.value)}
        aria-label={t("theme.switchAriaLabel", {
          current: t(`theme.${current.labelKey}`),
          next: t(`theme.${next.labelKey}`),
        })}
        title={t("theme.currentTitle", { current: t(`theme.${current.labelKey}`) })}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-violet-100 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-neutral-400 dark:hover:bg-violet-950 dark:hover:text-violet-300 dark:focus-visible:ring-cyan-300 dark:focus-visible:ring-offset-neutral-950"
      >
        <Icon aria-hidden size={18} />
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label={t("theme.groupLabel")}
      className="inline-flex w-full gap-1 rounded-lg border border-neutral-200 p-1 dark:border-neutral-800"
    >
      {OPTIONS.map((o) => {
        const Icon = o.icon;
        const active = choice === o.value;
        const label = t(`theme.${o.labelKey}`);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => select(o.value)}
            aria-pressed={active}
            title={label}
            className={`inline-flex flex-1 items-center justify-center rounded-md px-2 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-cyan-300 dark:focus-visible:ring-offset-neutral-950 ${
              active
                ? "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
                : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
            }`}
          >
            <Icon aria-hidden size={16} />
            <span className="sr-only">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
