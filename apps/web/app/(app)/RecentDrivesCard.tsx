import Link from "next/link";
import { ArrowRight, Route } from "lucide-react";
import { getTranslations } from "next-intl/server";
import {
  formatConsumption,
  formatDuration,
  formatKm,
  formatPlaceLabel,
  formatSoc,
} from "@tripatlas/core";
import { APP_TIMEZONE } from "../../lib/config";
import type { DriveTrack, RecentDriveRow } from "../../lib/dashboard";
import { EmptyState } from "../../components/ui/EmptyState";
import { CLASSIFICATION_DOT, type Classification } from "../../lib/classification";
import { DashboardMapLoader } from "./DashboardMapLoader";

export interface RecentDrivesCarInfo {
  lat: number;
  lon: number;
  displayName: string;
  placeName: string | null;
}

const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  timeZone: APP_TIMEZONE,
});
const timeFormatter = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: APP_TIMEZONE,
});

export async function RecentDrivesCard({
  drives,
  tracks,
  car,
}: {
  drives: RecentDriveRow[];
  tracks: DriveTrack[];
  car: RecentDrivesCarInfo | null;
}) {
  const [t, tCommon] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("common"),
  ]);

  // Newest-first (matches `drives` order), dropping drives without enough
  // recorded points to draw a line — the map is skipped entirely if none remain.
  const trackByDriveId = new Map(tracks.map((tr) => [tr.driveId, tr]));
  const orderedTracks = drives
    .map((d) => trackByDriveId.get(d.id))
    .filter((tr): tr is DriveTrack => tr != null && tr.points.length >= 2);

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
        {t("recentDrives.title")}
      </h2>

      {orderedTracks.length > 0 && (
        <div className="mt-3">
          {/* Key = Daten-Fingerprint: Leaflet wird nur einmal initialisiert;
              bei RSC-Refresh mit neuen Fahrten/Position remountet React die
              Karte so, statt sie veralten zu lassen (Codex-Finding). */}
          <DashboardMapLoader
            key={`${orderedTracks.map((tr) => tr.driveId).join("-")}:${car?.lat ?? ""},${car?.lon ?? ""}`}
            tracks={orderedTracks}
            car={car}
          />
        </div>
      )}

      {drives.length === 0 ? (
        <div className="mt-3">
          <EmptyState icon={Route} title={t("recentDrives.empty")} />
        </div>
      ) : (
        <ol className="mt-3 flex flex-col divide-y divide-neutral-100 dark:divide-neutral-800">
          {drives.map((d) => {
            const classification = d.classification as Classification;
            const from = formatPlaceLabel(d.startPlaceName, d.startAddress, d.startLat, d.startLon);
            const to = formatPlaceLabel(d.endPlaceName, d.endAddress, d.endLat, d.endLon);
            return (
              <li key={d.id}>
                <Link
                  href={`/drives/${d.id}`}
                  className="flex items-start gap-3 py-2.5 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
                >
                  <span
                    aria-hidden
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${CLASSIFICATION_DOT[classification]}`}
                    title={tCommon(`classification.${classification}`)}
                  />
                  <span className="w-16 shrink-0 pt-0.5 tabular-nums text-neutral-500 dark:text-neutral-400">
                    {dateFormatter.format(d.startTime)} {timeFormatter.format(d.startTime)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0 truncate">
                        {from} <span className="text-neutral-400">→</span> {to}
                      </span>
                      {d.distanceKm != null && (
                        <span className="shrink-0 tabular-nums text-neutral-500 dark:text-neutral-400">
                          {formatKm(d.distanceKm)}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 flex flex-wrap gap-x-1 text-xs tabular-nums text-neutral-400 dark:text-neutral-500">
                      {d.durationSeconds != null && (
                        <span>{formatDuration(d.durationSeconds)}</span>
                      )}
                      {d.avgConsumptionWhKm != null && (
                        <span>
                          {d.durationSeconds != null ? "· " : ""}
                          {formatConsumption(d.avgConsumptionWhKm, d.energyIsEstimated)}
                        </span>
                      )}
                      {d.startSoc != null && d.endSoc != null && (
                        <span>
                          {d.durationSeconds != null || d.avgConsumptionWhKm != null ? "· " : ""}
                          {formatSoc(d.startSoc)} → {formatSoc(d.endSoc)}
                        </span>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-3 border-t border-neutral-100 pt-3 dark:border-neutral-800">
        <Link
          href="/day"
          className="inline-flex items-center gap-1 text-sm font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
        >
          {t("recentDrives.dayViewCta")} <ArrowRight aria-hidden size={14} />
        </Link>
      </div>
    </section>
  );
}
