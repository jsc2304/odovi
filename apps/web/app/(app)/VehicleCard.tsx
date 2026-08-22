import { BatteryCharging, Car as CarIcon, MapPin } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDuration, formatKwh, formatOdometer, formatTime } from "@tripatlas/core";
import { APP_TIMEZONE } from "../../lib/config";
import { formatRelativeTime } from "../../lib/day";
import type { OpenSessionStatus, VehicleStatusRow } from "../../lib/dashboard";
import type { DashboardParkDrain } from "../../lib/parkAnalytics";

type VehicleCardTranslator = Awaited<ReturnType<typeof getTranslations>>;

function socColor(soc: number): string {
  if (soc > 50) return "bg-emerald-500";
  if (soc >= 20) return "bg-amber-500";
  return "bg-red-500";
}

function socTextColor(soc: number): string {
  if (soc > 50) return "text-emerald-600 dark:text-emerald-400";
  if (soc >= 20) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function statusLine(
  t: VehicleCardTranslator,
  openSession: OpenSessionStatus | null,
  status: VehicleStatusRow,
): string {
  if (openSession) {
    if (openSession.kind === "driving") return t("vehicleCard.drivingNow");
    if (openSession.kind === "charging") {
      return openSession.energyAddedKwh != null
        ? t("vehicleCard.chargingNowWithEnergy", {
            energy: formatKwh(openSession.energyAddedKwh, { sign: true }),
          })
        : t("vehicleCard.chargingNow");
    }
    // parked
    const place = openSession.placeName ?? status.placeName;
    const parked =
      openSession.since != null
        ? t("vehicleCard.parkedSince", { time: formatTime(openSession.since, APP_TIMEZONE) })
        : t("vehicleCard.parked");
    return [parked, place].filter(Boolean).join(" · ");
  }

  // Fallback: derive from vehicle_status.state alone.
  if (status.state === "driving") return t("vehicleCard.drivingNow");
  if (status.state === "charging") return t("vehicleCard.chargingNow");
  if (status.state === "online" || status.state === "asleep" || status.state === "offline") {
    const parked =
      status.stateSince != null
        ? t("vehicleCard.parkedSince", { time: formatTime(status.stateSince, APP_TIMEZONE) })
        : t("vehicleCard.parked");
    return [parked, status.placeName].filter(Boolean).join(" · ");
  }
  return t("vehicleCard.statusUnknown");
}

export async function VehicleCard({
  status,
  openSession,
  parkDrain,
}: {
  status: VehicleStatusRow;
  openSession: OpenSessionStatus | null;
  parkDrain: DashboardParkDrain;
}) {
  const [t, locale] = await Promise.all([
    getTranslations("dashboard"),
    getLocale(),
  ]);
  const soc = status.soc;
  const activePark = openSession?.kind === "parked";
  const displayedPark = activePark ? parkDrain.current : parkDrain.previous;

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
        <CarIcon aria-hidden size={18} />
        <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          {status.displayName}
        </h1>
      </div>

      {soc != null ? (
        <div className="mt-4">
          <div className="flex items-baseline gap-2">
            <span className={`text-4xl font-semibold tabular-nums ${socTextColor(soc)}`}>
              {Math.round(soc)}
            </span>
            <span className="text-lg text-neutral-400">%</span>
            {status.ratedRangeKm != null && (
              <span
                className="ml-3 text-lg tabular-nums text-neutral-500 dark:text-neutral-400"
                title={t("vehicleCard.ratedRangeTitle")}
              >
                ≈ {Math.round(status.ratedRangeKm)} km
              </span>
            )}
          </div>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
            <div
              className={`h-full rounded-full ${socColor(soc)}`}
              style={{ width: `${Math.max(0, Math.min(100, soc))}%` }}
            />
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-neutral-400">{t("vehicleCard.socUnknown")}</p>
      )}

      <div className="mt-4 flex items-center gap-1.5 text-sm text-neutral-600 dark:text-neutral-300">
        <MapPin aria-hidden size={15} className="shrink-0 text-neutral-400" />
        <span>{status.placeName ?? t("vehicleCard.placeUnknown")}</span>
      </div>

      <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-neutral-900 dark:text-neutral-100">
        <BatteryCharging aria-hidden size={15} className="shrink-0 text-neutral-400" />
        {statusLine(t, openSession, status)}
      </p>

      {(displayedPark || parkDrain.totalSinceLastChargePct != null) && (
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 rounded-xl bg-neutral-50 px-3 py-2.5 text-sm dark:bg-neutral-800/60">
          {displayedPark && (
            <span className="font-medium text-neutral-800 dark:text-neutral-200">
              {displayedPark.lossPct != null
                ? t(activePark ? "vehicleCard.currentParkDrain" : "vehicleCard.previousParkDrain", {
                    pct: displayedPark.lossPct,
                    duration: formatDuration(displayedPark.durationSeconds),
                  })
                : t(activePark ? "vehicleCard.currentParkDrainUnknown" : "vehicleCard.previousParkDrainUnknown", {
                    duration: formatDuration(displayedPark.durationSeconds),
                  })}
            </span>
          )}
          {parkDrain.totalSinceLastChargePct != null && (
            <span className="text-neutral-500 dark:text-neutral-400">
              {t("vehicleCard.totalDrainSinceCharge", {
                pct: parkDrain.totalSinceLastChargePct,
              })}
            </span>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-3 text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
        <span>
          {status.odometerKm != null
            ? formatOdometer(status.odometerKm)
            : t("vehicleCard.odometerUnknown")}
        </span>
        <span>
          {status.syncedAt != null
            ? t("vehicleCard.lastUpdated", { time: formatRelativeTime(status.syncedAt, locale) })
            : t("vehicleCard.neverSynced")}
        </span>
      </div>
    </section>
  );
}
