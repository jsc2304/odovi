import Link from "next/link";
import { ArrowRight, Route } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { formatConsumption, formatDuration, formatKm, formatPlaceLabel } from "@odovi/core";
import { APP_TIMEZONE } from "../../lib/config";
import { toIntlLocale } from "../../lib/i18nLocale";
import type { DriveTrack, RecentDriveRow } from "../../lib/dashboard";
import { EmptyState } from "../../components/ui/EmptyState";
import { DashboardMapLoader } from "./DashboardMapLoader";
import { DriveJournal } from "./DriveJournal";

export interface RecentDrivesCarInfo {
  lat: number;
  lon: number;
  displayName: string;
  placeName: string | null;
}

export async function RecentDrivesCard({ drives, tracks, car }: {
  drives: RecentDriveRow[];
  tracks: DriveTrack[];
  car: RecentDrivesCarInfo | null;
}) {
  const [t, locale] = await Promise.all([getTranslations("dashboard"), getLocale()]);
  const dateFormatter = new Intl.DateTimeFormat(toIntlLocale(locale), { day: "numeric", month: "short", timeZone: APP_TIMEZONE });
  const timeFormatter = new Intl.DateTimeFormat(toIntlLocale(locale), { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: APP_TIMEZONE });
  const trackByDriveId = new Map(tracks.map((track) => [track.driveId, track]));
  const orderedTracks = drives.map((drive) => trackByDriveId.get(drive.id))
    .filter((track): track is DriveTrack => track != null && track.points.length >= 2);

  return (
    <>
      {orderedTracks.length > 0 && <div className="overview-map">
        <DashboardMapLoader
          key={`${orderedTracks.map((track) => track.driveId).join("-")}:${car?.lat ?? ""},${car?.lon ?? ""}`}
          tracks={orderedTracks} car={car}
        />
      </div>}
      <section className="mt-5" aria-labelledby="recent-drives-heading">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="recent-drives-heading" className="editorial-heading">{t("recentDrives.title")}</h2>
          <Link href="/day" className="inline-flex min-h-9 items-center gap-2 text-xs text-neutral-500 hover:text-accent-700 dark:text-neutral-400 dark:hover:text-accent-300">{t("recentDrives.dayViewCta")}<ArrowRight aria-hidden size={14} /></Link>
        </div>
        {drives.length === 0 ? <EmptyState icon={Route} title={t("recentDrives.empty")} /> : <DriveJournal drives={drives.map((drive) => ({
          id: drive.id,
          date: dateFormatter.format(drive.startTime),
          time: timeFormatter.format(drive.startTime),
          from: formatPlaceLabel(drive.startPlaceName, drive.startAddress, drive.startLat, drive.startLon, locale),
          to: formatPlaceLabel(drive.endPlaceName, drive.endAddress, drive.endLat, drive.endLon, locale),
          distance: drive.distanceKm == null ? "—" : formatKm(drive.distanceKm, locale),
          duration: drive.durationSeconds == null ? "—" : formatDuration(drive.durationSeconds),
          consumption: drive.avgConsumptionWhKm == null ? null : formatConsumption(drive.avgConsumptionWhKm, drive.energyIsEstimated),
          classification: drive.classification,
        }))} />}
      </section>
    </>
  );
}
