import React from "react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { formatConsumption, formatDuration, formatKm, formatKwh } from "@odovi/core";
import type { SinceChargeStats } from "../../lib/sinceCharge";
import { APP_TIMEZONE } from "../../lib/config";
import { toIntlLocale } from "../../lib/i18nLocale";

export async function SinceChargeCard({ stats }: { stats: SinceChargeStats }) {
  const [t, locale] = await Promise.all([getTranslations("sinceCharge"), getLocale()]);
  const ready = stats.state === "ready";
  return (
    <section aria-labelledby="since-charge-title" className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="since-charge-title" className="text-sm font-semibold">{t("title")}</h2>
        {ready && <Link href={`/charges/${stats.chargeId}`} className="text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">
          {t("completed", { time: new Intl.DateTimeFormat(toIntlLocale(locale), {
            dateStyle: "medium", timeStyle: "short", timeZone: APP_TIMEZONE,
          }).format(stats.chargeEndTime) })}
        </Link>}
      </div>
      {ready ? <>
        <dl className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-5">
          {[
            [t("drives"), String(stats.driveCount)],
            [t("distance"), stats.distanceKm === null ? t("unavailable") : formatKm(stats.distanceKm, locale)],
            [t("energy"), stats.energyKwh === null ? t("unavailable") : formatKwh(stats.energyKwh, {}, locale)],
            [t("consumption"), stats.avgConsumptionWhKm === null ? t("unavailable") : formatConsumption(stats.avgConsumptionWhKm, false)],
            [t("duration"), stats.durationSeconds === null ? t("unavailable") : formatDuration(stats.durationSeconds)],
          ].map(([label, value]) => <div key={label} className="last:col-span-2 lg:last:col-span-1"><dt className="text-xs text-neutral-500 dark:text-neutral-400">{label}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd></div>)}
        </dl>
        <div className="mt-3 space-y-1 text-xs text-neutral-500 dark:text-neutral-400">
          <p>{t("scope")}</p>
          {stats.anyEstimated && <p>{t("estimated")}</p>}
          {stats.hasIncompleteEnergy && <p>{t("partialEnergy")}</p>}
          {stats.missingDistanceDriveCount > 0 && <p>{t("partialDistance")}</p>}
          {stats.excludedStraddlingDriveCount > 0 && <p>{t("straddling", { count: stats.excludedStraddlingDriveCount })}</p>}
        </div>
      </> : <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">{t(stats.state === "charging" ? "charging" : "noCharge")}</p>}
    </section>
  );
}
