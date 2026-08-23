import { getTranslations } from "next-intl/server";
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
import { getCurrentWeather, type WeatherResult } from "../../lib/weather";
import { getDashboardParkDrain } from "../../lib/parkAnalytics";
import { getDefaultVehicleId } from "../../lib/search";
import { VehicleCard } from "./VehicleCard";
import { WeatherCard } from "./WeatherCard";
import { TpmsCard } from "./TpmsCard";
import { RecentDrivesCard } from "./RecentDrivesCard";
import { StatsRow } from "./StatsRow";
import { EmptyState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";
import { Car, Rocket, Stethoscope } from "lucide-react";

export const dynamic = "force-dynamic";

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
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
            1
          </span>
          <span className="text-neutral-700 dark:text-neutral-300">
            {t.rich("step1", { code: codeTag })}
          </span>
        </li>
        <li className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
            2
          </span>
          <span className="text-neutral-700 dark:text-neutral-300">
            {t.rich("step2", { code: codeTag })}
          </span>
        </li>
        <li className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
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
  const t = await getTranslations("dashboard");

  if (vehicleId == null) {
    return <OnboardingCard />;
  }

  const [status, openSession, parkDrain, recentDrives, today, week, lastCharge, unclassifiedCount] =
    await Promise.all([
      getVehicleStatus(vehicleId),
      getOpenSessionStatus(vehicleId),
      getDashboardParkDrain(vehicleId),
      getRecentDrives(vehicleId, 5),
      getTodayStats(vehicleId),
      getWeekStats(vehicleId),
      getLastCharge(vehicleId),
      getUnclassifiedCount(vehicleId),
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

  let weather: WeatherResult | null = null;
  if (status?.lat != null && status.lon != null) {
    weather = await getCurrentWeather(status.lat, status.lon);
  }

  return (
    <div className="flex flex-col gap-4 md:grid md:grid-cols-3 md:gap-4">
      <div className="md:col-span-2">
        {status ? (
          <VehicleCard status={status} openSession={openSession} parkDrain={parkDrain} />
        ) : (
          <EmptyState icon={Car} title={t("vehicleStatusEmpty")} />
        )}
      </div>

      <div className="flex flex-col gap-4 md:col-span-1">
        <WeatherCard weather={weather} />
        {status && <TpmsCard status={status} />}
      </div>

      <div className="md:col-span-3">
        <StatsRow
          today={today}
          week={week}
          lastCharge={lastCharge}
          unclassifiedCount={unclassifiedCount}
        />
      </div>

      <div className="md:col-span-3">
        <RecentDrivesCard drives={recentDrives} tracks={driveTracks} car={car} />
      </div>
    </div>
  );
}
