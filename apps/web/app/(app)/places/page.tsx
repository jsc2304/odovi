import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus, MapPin } from "lucide-react";
import { formatDuration } from "@odovi/core";
import { getAllPlacesWithUsage } from "../../../lib/queries";
import { getPlaceDwellStats } from "../../../lib/parkAnalytics";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";

export const dynamic = "force-dynamic";

export default async function PlacesPage() {
  const t = await getTranslations("places");
  const tYearly = await getTranslations("yearly");
  const placeRows = await getAllPlacesWithUsage();
  const dwellStatsByPlaceId = await getPlaceDwellStats();

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {t("description")}
          </p>
        </div>
        <Button
          href="/places/new"
          variant="primary"
          className="shrink-0"
          icon={<Plus aria-hidden size={16} />}
        >
          {t("newPlace")}
        </Button>
      </div>

      <Link href="/places/heatmap" className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-400">
        <MapPin aria-hidden size={16} />{tYearly("heatmap.entry")}
      </Link>

      <div className="mt-6 flex flex-col gap-2">
        {placeRows.length === 0 && (
          <EmptyState
            icon={MapPin}
            title={t("empty.title")}
            hint={t("empty.hint")}
            action={{
              label: t("newPlace"),
              href: "/places/new",
              icon: <Plus aria-hidden size={16} />,
            }}
          />
        )}
        {placeRows.map((place) => {
          const totalUsage =
            place.driveStartCount + place.driveEndCount + place.chargeCount + place.parkCount;
          const dwell = dwellStatsByPlaceId.get(place.id);
          return (
            <Link
              key={place.id}
              href={`/places/${place.id}/edit`}
              className="rounded-xl border border-neutral-200 bg-white p-4 transition hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium text-neutral-900 dark:text-neutral-100">
                    {place.name}
                  </span>
                  <span className="shrink-0 rounded-full border border-neutral-300 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300">
                    {t(`placeTypes.${place.type}`)}
                  </span>
                </div>
                <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">
                  {t("list.radius", { radius: place.radiusM })}
                </span>
              </div>

              {place.address && (
                <p className="mt-1 truncate text-sm text-neutral-500 dark:text-neutral-400">
                  {place.address}
                </p>
              )}

              <dl className="mt-3 grid grid-cols-4 gap-2 text-center text-xs text-neutral-500 dark:text-neutral-400">
                <div>
                  <dt>{t("list.start")}</dt>
                  <dd className="mt-0.5 font-medium tabular-nums text-neutral-900 dark:text-neutral-100">
                    {place.driveStartCount}
                  </dd>
                </div>
                <div>
                  <dt>{t("list.destination")}</dt>
                  <dd className="mt-0.5 font-medium tabular-nums text-neutral-900 dark:text-neutral-100">
                    {place.driveEndCount}
                  </dd>
                </div>
                <div>
                  <dt>{t("list.charging")}</dt>
                  <dd className="mt-0.5 font-medium tabular-nums text-neutral-900 dark:text-neutral-100">
                    {place.chargeCount}
                  </dd>
                </div>
                <div>
                  <dt>{t("list.parking")}</dt>
                  <dd className="mt-0.5 font-medium tabular-nums text-neutral-900 dark:text-neutral-100">
                    {place.parkCount}
                  </dd>
                </div>
              </dl>

              {dwell && dwell.parkCount > 0 && (
                <dl className="mt-2 grid grid-cols-1 gap-2 border-t border-neutral-100 pt-2 text-center text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400 sm:grid-cols-2">
                  <div>
                    <dt>{t("list.avgDwellTime")}</dt>
                    <dd className="mt-0.5 font-medium tabular-nums text-neutral-900 dark:text-neutral-100">
                      {formatDuration(dwell.avgDwellSeconds)}
                    </dd>
                  </div>
                  <div className="hidden sm:block">
                    <dt>{t("list.totalVampireLoss")}</dt>
                    <dd className="mt-0.5 font-medium tabular-nums text-neutral-900 dark:text-neutral-100">
                      {t("list.vampireLoss", { pct: dwell.totalVampireLossPct })}
                    </dd>
                  </div>
                </dl>
              )}

              {totalUsage === 0 && (
                <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500">
                  {t("list.notUsedYet")}
                </p>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
