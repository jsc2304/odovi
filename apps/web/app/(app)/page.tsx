import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import {
  getVehicleStatus,
  getOpenSessionStatus,
  getRecentDrives,
  getRecentDriveTracks,
  getTodayStats,
  getWeekStats,
  getLastCharge,
  getUnclassifiedCount,
} from "../../lib/dashboard";
import { getCurrentWeather } from "../../lib/weather";
import { getDashboardParkDrain } from "../../lib/parkAnalytics";
import { getDefaultVehicleId } from "../../lib/search";
import { VehicleCard } from "./VehicleCard";
import { WeatherCard } from "./WeatherCard";
import { TpmsCard } from "./TpmsCard";
import { RecentDrivesCard } from "./RecentDrivesCard";
import { StatsRow } from "./StatsRow";
import { Button } from "../../components/ui/Button";
import { ArrowRight, Car, Clock3, Rocket, Route, Search, Stethoscope } from "lucide-react";
import { formatDuration, formatKm } from "@odovi/core";
import { APP_TIMEZONE } from "../../lib/config";
import { toIntlLocale } from "../../lib/i18nLocale";
import { getDrivingProfile } from "../../lib/drivingProfile";
import { DrivingProfileForm } from "../../components/DrivingProfileForm";
import { ClassificationTask } from "./ClassificationTask";
import { VehicleSummary } from "./VehicleSummary";

export const dynamic = "force-dynamic";

async function OptionalWeather({ lat, lon }: { lat: number | null; lon: number | null }) {
  const result = lat != null && lon != null ? await getCurrentWeather(lat, lon) : { status: "unavailable" as const };
  return <WeatherCard result={result} />;
}

/**
 * Onboarding-Zustand für die Frischinstallation: 0 Fahrzeuge in der DB heißt
 * entweder "Worker läuft noch nicht" oder "erster Sync läuft noch". Ersetzt
 * die frühere schlichte EmptyState — mit Checkliste statt nur einem Satz,
 * damit neue Betreiber selbst debuggen können statt zu raten.
 */
async function OnboardingCard() {
  const t = await getTranslations("dashboard.onboarding");
  const codeTag = (chunks: React.ReactNode) => <code className="font-mono">{chunks}</code>;

  return (
    <div className="rounded-2xl border border-dashed border-neutral-300 p-6 dark:border-neutral-700 sm:p-8">
      <div className="mx-auto max-w-lg text-center">
        <Rocket
          aria-hidden
          size={28}
          className="mx-auto text-neutral-400 dark:text-neutral-600"
          strokeWidth={1.75}
        />
        <h1 className="mt-3 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          {t("description")}
        </p>
      </div>

      <ol className="mx-auto mt-6 flex max-w-md flex-col gap-3 text-left text-sm">
        <li className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            1
          </span>
          <span className="text-neutral-700 dark:text-neutral-300">
            {t.rich("step1", { code: codeTag })}
          </span>
        </li>
        <li className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            2
          </span>
          <span className="text-neutral-700 dark:text-neutral-300">
            {t.rich("step2", { code: codeTag })}
          </span>
        </li>
        <li className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            3
          </span>
          <span className="text-neutral-700 dark:text-neutral-300">{t("step3")}</span>
        </li>
      </ol>

      <div className="mx-auto mt-6 flex max-w-md justify-center">
        <Button
          href="/settings#diagnose"
          variant="primary"
          icon={<Stethoscope aria-hidden size={16} />}
        >
          {t("diagnoseCta")}
        </Button>
      </div>

      <p className="mx-auto mt-4 max-w-md text-center text-xs text-neutral-500 dark:text-neutral-400">
        {t.rich("demoHint", {
          compose: codeTag,
          docs: codeTag,
        })}
      </p>
    </div>
  );
}

export default async function DashboardPage() {
  const vehicleId = await getDefaultVehicleId();
  const [t, locale] = await Promise.all([getTranslations("dashboard"), getLocale()]);

  if (vehicleId == null) {
    return <OnboardingCard />;
  }

  const [status, openSession, parkDrain, recentDrives, today, week, lastCharge, unclassifiedCount, drivingProfile] =
    await Promise.all([
      getVehicleStatus(vehicleId),
      getOpenSessionStatus(vehicleId),
      getDashboardParkDrain(vehicleId),
      getRecentDrives(vehicleId, 4),
      getTodayStats(vehicleId),
      getWeekStats(vehicleId),
      getLastCharge(vehicleId),
      getUnclassifiedCount(vehicleId),
      getDrivingProfile(vehicleId),
    ]);

  const driveTracks = await getRecentDriveTracks(recentDrives.map((d) => d.id));
  const car =
    status?.lat != null && status.lon != null
      ? {
          lat: status.lat,
          lon: status.lon,
          displayName: status.displayName,
          placeName: status.placeName,
        }
      : null;

  const date = new Intl.DateTimeFormat(toIntlLocale(locale), {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: APP_TIMEZONE,
  }).format(new Date());

  return (
    <div className="dashboard-overview">
      <header className="overview-header">
        <div>
          <h1>{t("overview.title")}</h1>
          <p className="mt-2 text-[13px] text-neutral-500 dark:text-neutral-400">{date}</p>
        </div>
        <form action="/search" role="search" className="overview-search">
          <Search aria-hidden size={18} />
          <input type="search" name="q" aria-label={t("overview.search")} placeholder={t("overview.search")} />
          <button type="submit" aria-label={t("overview.submitSearch")} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800">
            <ArrowRight aria-hidden size={17} />
          </button>
        </form>
        {status && <VehicleSummary status={status} openSession={openSession} />}
      </header>

      <ClassificationTask vehicleId={vehicleId} count={unclassifiedCount.live + unclassifiedCount.imported}
        imported={unclassifiedCount.imported} profile={drivingProfile} />

      {!drivingProfile && <details className="card mt-3 p-4">
        <summary className="cursor-pointer text-sm font-medium">{t("drivingProfile.title")}</summary>
        <div className="mt-4"><DrivingProfileForm vehicleId={vehicleId} profile={null} /></div>
      </details>}

      <dl className="overview-summary" aria-label={t("stats.today")}>
        <div><Car aria-hidden /><dt className="sr-only">{t("overview.driveCount")}</dt><dd>{t("stats.driveCount", { count: today.driveCount })}</dd></div>
        <div><Route aria-hidden /><dt className="sr-only">{t("overview.distance")}</dt><dd>{formatKm(today.distanceKm, locale)}</dd></div>
        <div><Clock3 aria-hidden /><dt className="sr-only">{t("overview.duration")}</dt><dd>{today.durationSeconds == null ? "—" : formatDuration(today.durationSeconds)}</dd></div>
      </dl>

      <RecentDrivesCard drives={recentDrives} tracks={driveTracks} car={car} />

      <details id="vehicle-details" className="overview-details group">
        <summary className="cursor-pointer py-5 text-sm font-medium text-neutral-600 dark:text-neutral-300">{t("overview.vehicleDetails")}</summary>
        <div className="grid gap-4 pb-5 md:grid-cols-3">
          {status && <div className="md:col-span-2"><VehicleCard status={status} openSession={openSession} parkDrain={parkDrain} /></div>}
          <div className="flex flex-col gap-4">
            <Suspense fallback={<div className="card min-h-32 p-5" role="status">{t("overview.weatherLoading")}</div>}>
              <OptionalWeather lat={status?.lat ?? null} lon={status?.lon ?? null} />
            </Suspense>
            {status && <TpmsCard status={status} />}
          </div>
          <div className="md:col-span-3"><StatsRow today={today} week={week} lastCharge={lastCharge} unclassifiedCount={unclassifiedCount} /></div>
        </div>
      </details>
    </div>
  );
}
