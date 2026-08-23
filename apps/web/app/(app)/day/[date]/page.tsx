import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, CalendarDays, Download, Sparkles } from "lucide-react";
import {
  formatConsumption,
  formatDuration,
  formatKm,
  formatKwh,
  summarizeDriveEnergy,
} from "@tripatlas/core";
import { APP_TIMEZONE } from "../../../../lib/config";
import {
  formatLongDate,
  isValidDateParam,
  shiftDate,
  todayInAppTz,
} from "../../../../lib/day";
import { getAllTags, getDayTimeline, getVehicles } from "../../../../lib/queries";
import { getParkLossForSessions } from "../../../../lib/parkAnalytics";
import { buttonClasses } from "../../../../components/ui/Button";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { VehicleRequiredState } from "../../../../components/VehicleRequiredState";
import {
  BulkSelectionProvider,
  SelectionToggle,
} from "../../../../components/bulkSelection";
import { DateNav } from "./DateNav";
import { VehicleSwitcher } from "./VehicleSwitcher";
import { Timeline } from "./Timeline";

export const dynamic = "force-dynamic";

export default async function DayPage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ vehicle?: string }>;
}) {
  const [t, locale] = await Promise.all([
    getTranslations("day"),
    getLocale(),
  ]);
  const { date } = await params;
  if (!isValidDateParam(date)) notFound();

  const { vehicle } = await searchParams;
  const vehicles = await getVehicles();
  if (vehicles.length === 0) {
    const today = todayInAppTz();
    return (
      <div className="mx-auto max-w-2xl">
        <DateNav
          date={date}
          longLabel={formatLongDate(date, locale)}
          prevDate={shiftDate(date, -1)}
          nextDate={shiftDate(date, 1)}
          today={today}
          vehicleQuery=""
        />
        <VehicleRequiredState className="max-w-2xl" />
      </div>
    );
  }

  const requested = vehicle ? Number(vehicle) : NaN;
  const current =
    vehicles.find((v) => v.id === requested) ?? vehicles[0];

  const timeline = await getDayTimeline(current.id, date);
  const parkLossById = await getParkLossForSessions(
    timeline.parks.map((p) => p.id),
  );
  const allTags = await getAllTags();
  const tagOptions = allTags.map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color,
  }));
  const driveIds = timeline.drives.map((d) => d.id);
  const now = Date.now();

  const vehicleQuery =
    vehicles.length > 1 ? `?vehicle=${current.id}` : "";

  // Day totals (drives only).
  const driveCount = timeline.drives.length;
  const energySummary = summarizeDriveEnergy(timeline.drives);
  const totalKm = energySummary.totalDistanceKm;
  const totalDriveSeconds = timeline.drives.reduce(
    (sum, d) => sum + (d.durationSeconds ?? 0),
    0,
  );
  const totalEnergy = energySummary.totalEnergyKwh;
  const anyEstimated = energySummary.anyEstimated;

  const isEmpty =
    timeline.drives.length === 0 &&
    timeline.parks.length === 0 &&
    timeline.charges.length === 0;

  const today = todayInAppTz();

  return (
    <div className="mx-auto max-w-2xl">
      <DateNav
        date={date}
        longLabel={formatLongDate(date, locale)}
        prevDate={shiftDate(date, -1)}
        nextDate={shiftDate(date, 1)}
        today={today}
        vehicleQuery={vehicleQuery}
      />

      <div className="mt-2 flex items-center justify-end gap-1.5">
        <a
          href={`/api/export/day/${date}?format=csv`}
          className={buttonClasses("ghost", "sm")}
        >
          <Download aria-hidden size={14} />
          CSV
        </a>
        <a
          href={`/api/export/day/${date}?format=pdf`}
          className={buttonClasses("ghost", "sm")}
        >
          <Download aria-hidden size={14} />
          PDF
        </a>
      </div>

      {vehicles.length > 1 && (
        <div className="mt-3">
          <VehicleSwitcher
            vehicles={vehicles}
            current={current.id}
            date={date}
          />
        </div>
      )}

      {driveCount >= 2 && (
        <Link
          href={`/day-recap/${date}${vehicleQuery}`}
          className="group mt-5 flex items-center justify-between gap-4 overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-sky-50 p-4 transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-lg hover:shadow-violet-100 dark:border-violet-900/60 dark:from-violet-950/50 dark:via-neutral-900 dark:to-sky-950/40 dark:hover:border-violet-700 dark:hover:shadow-violet-950/40"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-lg shadow-violet-300 dark:shadow-violet-950">
              <Sparkles aria-hidden size={19} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-neutral-900 dark:text-white">
                {t("recap.open")}
              </span>
              <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">
                {t("recap.preview", { count: driveCount })}
              </span>
            </span>
          </span>
          <ArrowRight
            aria-hidden
            size={18}
            className="shrink-0 text-violet-500 transition-transform group-hover:translate-x-1"
          />
        </Link>
      )}

      <div className="mt-6">
        {isEmpty ? (
          <EmptyState
            icon={CalendarDays}
            title={t("emptyTitle")}
            hint={t("emptyHint")}
          />
        ) : (
          <BulkSelectionProvider allIds={driveIds} tags={tagOptions}>
            {driveIds.length > 0 && (
              <div className="mb-3 flex items-center justify-end">
                <SelectionToggle />
              </div>
            )}

            <Timeline
              timeline={timeline}
              tz={APP_TIMEZONE}
              now={now}
              parkLossById={parkLossById}
            />

            <div
              className="mt-6 border-t border-neutral-200 pt-4 dark:border-neutral-800"
              data-testid="day-totals"
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                <span>{t("driveCount", { count: driveCount })}</span>
                <span aria-hidden>·</span>
                <span className="tabular-nums">{formatKm(totalKm)}</span>
                <span aria-hidden>·</span>
                <span className="tabular-nums">
                  {formatDuration(totalDriveSeconds)} {t("driveTime")}
                </span>
                {totalEnergy > 0 && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="tabular-nums">
                      {formatKwh(totalEnergy)}
                      {anyEstimated ? ` (${t("estimated")})` : ""}
                    </span>
                  </>
                )}
                {energySummary.avgConsumptionWhKm != null && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="tabular-nums">
                      {formatConsumption(
                        energySummary.avgConsumptionWhKm,
                        anyEstimated,
                      )}
                    </span>
                  </>
                )}
              </div>
              {anyEstimated && (
                <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                  {t("estimatedLegend")}
                </p>
              )}
              {energySummary.hasIncompleteEnergy && (
                <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                  {t("partialEnergyLegend")}
                </p>
              )}
            </div>
          </BulkSelectionProvider>
        )}
      </div>
    </div>
  );
}
