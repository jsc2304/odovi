import Link from "next/link";
import { CalendarDays, CalendarRange, Zap, HelpCircle, ArrowRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import {
  formatConsumption,
  formatDuration,
  formatKm,
  formatKwh,
  formatPlaceLabel,
  formatSoc,
} from "@tripatlas/core";
import { formatRelativeTime } from "../../lib/day";
import { toIntlLocale } from "../../lib/i18nLocale";
import type {
  LastChargeStats,
  TodayStats,
  UnclassifiedCount,
  WeekStats,
} from "../../lib/dashboard";

function StatCard({
  icon: Icon,
  label,
  children,
  href,
}: {
  icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean; className?: string }>;
  label: string;
  children: React.ReactNode;
  href?: string;
}) {
  const content = (
    <>
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-neutral-400">
        <Icon aria-hidden size={13} />
        {label}
      </div>
      <div className="mt-1.5">{children}</div>
    </>
  );
  const classes =
    "rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900";
  if (href) {
    return (
      <Link
        href={href}
        className={`${classes} transition hover:border-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 dark:hover:border-neutral-600 dark:focus-visible:ring-white dark:focus-visible:ring-offset-neutral-950`}
      >
        {content}
      </Link>
    );
  }
  return <div className={classes}>{content}</div>;
}

function formatMoney(
  value: string,
  currency: string | null,
  locale: string,
): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  if (!currency) return amount.toFixed(2);
  try {
    return new Intl.NumberFormat(toIntlLocale(locale), {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function costSourceKey(value: string | null): "auto" | "manual" | "synced" | "unknown" {
  if (value === "auto" || value === "manual" || value === "synced") return value;
  return "unknown";
}

export async function StatsRow({
  today,
  week,
  lastCharge,
  unclassifiedCount,
}: {
  today: TodayStats;
  week: WeekStats;
  lastCharge: LastChargeStats | null;
  unclassifiedCount: UnclassifiedCount;
}) {
  const [t, tCommon, locale] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("common"),
    getLocale(),
  ]);

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatCard icon={CalendarDays} label={t("stats.today")} href="/day">
        <p className="text-lg font-semibold tabular-nums">{formatKm(today.distanceKm)}</p>
        <p className="flex flex-wrap gap-x-1 text-xs text-neutral-500 dark:text-neutral-400">
          <span>{t("stats.driveCount", { count: today.driveCount })}</span>
          {today.energyKwh > 0 && (
            <span>
              · {formatKwh(today.energyKwh)}{today.anyEstimated ? " ~" : ""}
            </span>
          )}
          {today.avgConsumptionWhKm != null && (
            <span title={today.hasIncompleteEnergy ? t("stats.partialEnergy") : undefined}>
              · {formatConsumption(today.avgConsumptionWhKm, today.anyEstimated)}
              {today.hasIncompleteEnergy ? "†" : ""}
            </span>
          )}
        </p>
      </StatCard>

      <StatCard icon={CalendarRange} label={t("stats.thisWeek")} href="/calendar">
        <p className="text-lg font-semibold tabular-nums">{formatKm(week.distanceKm)}</p>
        <p className="flex flex-wrap gap-x-1 text-xs text-neutral-500 dark:text-neutral-400">
          <span>{t("stats.driveCount", { count: week.driveCount })}</span>
          {week.energyKwh > 0 && (
            <span>
              · {formatKwh(week.energyKwh)}{week.anyEstimated ? " ~" : ""}
            </span>
          )}
          {week.avgConsumptionWhKm != null && (
            <span title={week.hasIncompleteEnergy ? t("stats.partialEnergy") : undefined}>
              · {formatConsumption(week.avgConsumptionWhKm, week.anyEstimated)}
              {week.hasIncompleteEnergy ? "†" : ""}
            </span>
          )}
        </p>
      </StatCard>

      <StatCard
        icon={Zap}
        label={t("stats.lastCharge")}
        href={lastCharge ? `/charges/${lastCharge.id}` : undefined}
      >
        {lastCharge ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="text-lg font-semibold tabular-nums">
                {lastCharge.energyAddedKwh != null
                  ? formatKwh(lastCharge.energyAddedKwh, { sign: true })
                  : tCommon("state.none")}
              </p>
              {lastCharge.chargerType && (
                <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                  {lastCharge.chargerType}
                </span>
              )}
            </div>
            <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
              {formatRelativeTime(lastCharge.endTime, locale)}
              {lastCharge.placeName || lastCharge.address
                ? ` · ${formatPlaceLabel(lastCharge.placeName, lastCharge.address, null, null)}`
                : ""}
            </p>
            <p className="mt-1 flex flex-wrap gap-x-1 text-xs text-neutral-500 dark:text-neutral-400">
              {lastCharge.startSoc != null && lastCharge.endSoc != null && (
                <span>
                  {formatSoc(lastCharge.startSoc)} → {formatSoc(lastCharge.endSoc)}
                </span>
              )}
              {lastCharge.durationSeconds != null && (
                <span>· {formatDuration(lastCharge.durationSeconds)}</span>
              )}
              {lastCharge.cost != null && (
                <span
                  title={t(`stats.costSource.${costSourceKey(lastCharge.costSource)}`)}
                >
                  · {formatMoney(lastCharge.cost, lastCharge.currency, locale)}
                </span>
              )}
            </p>
          </>
        ) : (
          <p className="text-sm text-neutral-400">{t("stats.noData")}</p>
        )}
      </StatCard>

      <StatCard
        icon={HelpCircle}
        label={t("stats.unclassified")}
        href={unclassifiedCount.live > 0 ? "/search?classification=unclassified" : undefined}
      >
        <p className="text-lg font-semibold tabular-nums">{unclassifiedCount.live}</p>
        {unclassifiedCount.live > 0 ? (
          <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-neutral-600 dark:text-neutral-400">
            {t("stats.classifyNow")} <ArrowRight aria-hidden size={11} />
          </span>
        ) : (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{t("stats.allDone")}</p>
        )}
        {unclassifiedCount.imported > 0 ? (
          <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">
            {t("stats.importedExtra", { count: unclassifiedCount.imported })}
          </p>
        ) : null}
      </StatCard>
    </div>
  );
}
