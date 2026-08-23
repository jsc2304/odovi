import { Lightbulb } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import {
  MIN_DRIVES_TOTAL,
  binByNumeric,
  coldVsMildDelta,
  shortTripShare,
  weeklyPattern,
  type Bin,
} from "@tripatlas/core";
import { APP_TIMEZONE } from "../../../lib/config";
import { toIntlLocale } from "../../../lib/i18nLocale";
import { getInsightsData, type InsightDrive } from "../../../lib/insights";
import { getVehicles } from "../../../lib/queries";
import { EmptyState } from "../../../components/ui/EmptyState";
import {
  MonthChart,
  ScatterBinnedChart,
  ShortTripDonut,
  WeekdayChart,
  type MonthDatum,
  type WeekdayDatum,
} from "./InsightCharts";
import { InsightsVehicleSwitcher } from "./InsightsVehicleSwitcher";
import { VehicleRequiredState } from "../../../components/VehicleRequiredState";

export const dynamic = "force-dynamic";

const TEMP_BIN_WIDTH = 5; // °C
const SPEED_BIN_WIDTH = 10; // km/h
const SHORT_TRIP_KM = 5;
const SHORT_TRIP_MIN_SHARE = 0.1; // Karte nur zeigen, wenn Anteil > 10 %

const MONDAY_UTC_DAY = 5;

/** Card-Rahmen im gleichen Stil wie die übrigen Seiten. */
function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          {subtitle}
        </p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

type Translator = Awaited<ReturnType<typeof getTranslations>>;

/** Gemeinsamer „noch nicht genug Daten"-Zustand je Karte. */
async function NotEnough() {
  const t = await getTranslations("insights");
  return (
    <EmptyState
      icon={Lightbulb}
      title={t("notEnoughTitle")}
      hint={t("notEnoughHint")}
    />
  );
}

function formatFirstDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: APP_TIMEZONE,
  }).format(date);
}

function formatMonthChartLabel(monthKey: string, locale: string): string {
  const [y, mo] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    month: "short",
    year: "2-digit",
    timeZone: APP_TIMEZONE,
  }).format(new Date(Date.UTC(y!, mo! - 1, 15)));
}

function formatWeekdayLabels(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(toIntlLocale(locale), {
    weekday: "short",
    timeZone: "UTC",
  });
  return Array.from({ length: 7 }, (_, idx) =>
    fmt.format(new Date(Date.UTC(2026, 0, MONDAY_UTC_DAY + idx))),
  );
}

/** Baut den dynamischen Untertitel der Temperatur-Karte aus den Bins. */
function tempSubtitle(bins: Bin[], t: Translator): string {
  const delta = coldVsMildDelta(bins);
  if (delta != null && delta.relativeDelta > 0.01) {
    const cold = Math.round(delta.coldCenter);
    const mild = Math.round(delta.mildCenter);
    const pct = Math.round(delta.relativeDelta * 100);
    return t("cards.temp.subtitleWithDelta", { cold, pct, mild });
  }
  return t("cards.temp.subtitleDefault");
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ vehicle?: string }>;
}) {
  const [t, locale] = await Promise.all([
    getTranslations("insights"),
    getLocale(),
  ]);
  const { vehicle } = await searchParams;

  const vehicles = await getVehicles();
  if (vehicles.length === 0) {
    return (
      <VehicleRequiredState
        title={t("title")}
        subtitle={t("subtitleNoData")}
      />
    );
  }

  const requested = vehicle ? Number(vehicle) : NaN;
  const current = vehicles.find((v) => v.id === requested) ?? vehicles[0]!;

  const { drives, firstDriveDate } = await getInsightsData(current.id);
  const total = drives.length;
  const enoughForPage = total >= MIN_DRIVES_TOTAL;

  // Temperatur-Bins (mit Wetter-Fallback bereits in tempC gemerged).
  const tempBins = binByNumeric<InsightDrive>(
    drives,
    (d) => d.tempC,
    (d) => d.avgConsumptionWhKm,
    TEMP_BIN_WIDTH,
  );
  const tempPoints = drives
    .filter((d) => d.tempC != null)
    .map((d) => ({ x: d.tempC!, y: d.avgConsumptionWhKm }));

  // Tempo-Bins.
  const speedBins = binByNumeric<InsightDrive>(
    drives,
    (d) => d.avgSpeedKmh,
    (d) => d.avgConsumptionWhKm,
    SPEED_BIN_WIDTH,
  );
  const speedPoints = drives
    .filter((d) => d.avgSpeedKmh != null)
    .map((d) => ({ x: d.avgSpeedKmh!, y: d.avgConsumptionWhKm }));

  // Monatsverlauf: km-Summe + Ø-Verbrauch je Monat (chronologisch).
  const monthMap = new Map<
    string,
    { km: number; consSum: number; count: number }
  >();
  for (const d of drives) {
    const m = monthMap.get(d.monthKey) ?? { km: 0, consSum: 0, count: 0 };
    m.km += d.distanceKm;
    m.consSum += d.avgConsumptionWhKm;
    m.count += 1;
    monthMap.set(d.monthKey, m);
  }
  const months: MonthDatum[] = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => {
      return {
        label: formatMonthChartLabel(key, locale),
        km: v.km,
        meanConsumption: v.consSum / v.count,
        driveCount: v.count,
      };
    });

  // Wochentagsmuster: km-Summe je Wochentag (Mo–So).
  const weekBuckets = weeklyPattern<InsightDrive>(
    drives,
    (d) => d.dow,
    (d) => d.distanceKm,
  );
  const weekdayLabels = formatWeekdayLabels(locale);
  const weekdays: WeekdayDatum[] = weekBuckets.map((b) => ({
    label: weekdayLabels[b.dow]!,
    km: b.sumY,
    count: b.count,
  }));

  // Kurzstrecken-Anteil.
  const shortTrip = shortTripShare<InsightDrive>(
    drives,
    (d) => d.distanceKm,
    (d) => d.avgConsumptionWhKm,
    SHORT_TRIP_KM,
  );
  const showShortTrip =
    enoughForPage && shortTrip.shortShare > SHORT_TRIP_MIN_SHARE;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {total > 0 && firstDriveDate
              ? t("subtitleWithData", { count: total, date: formatFirstDate(firstDriveDate, locale) })
              : t("subtitleNoData")}
          </p>
        </div>
        {vehicles.length > 1 && (
          <InsightsVehicleSwitcher vehicles={vehicles} current={current.id} />
        )}
      </div>

      {!enoughForPage && (
        <div className="mt-6">
          <EmptyState
            icon={Lightbulb}
            title={t("notEnoughTitle")}
            hint={t("notEnoughBannerHint", { min: MIN_DRIVES_TOTAL, count: total })}
          />
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 1. Verbrauch vs. Außentemperatur */}
        <Card
          title={t("cards.temp.title")}
          subtitle={enoughForPage ? tempSubtitle(tempBins, t) : undefined}
        >
          {enoughForPage && tempBins.length > 0 ? (
            <ScatterBinnedChart
              points={tempPoints}
              bins={tempBins}
              xUnit="°C"
              yUnit="Wh/km"
              xStep={TEMP_BIN_WIDTH}
              ariaLabel={t("cards.temp.ariaLabel")}
            />
          ) : (
            <NotEnough />
          )}
        </Card>

        {/* 2. Verbrauch vs. Durchschnittstempo */}
        <Card
          title={t("cards.speed.title")}
          subtitle={t("cards.speed.subtitle")}
        >
          {enoughForPage && speedBins.length > 0 ? (
            <ScatterBinnedChart
              points={speedPoints}
              bins={speedBins}
              xUnit="km/h"
              yUnit="Wh/km"
              xStep={SPEED_BIN_WIDTH}
              ariaLabel={t("cards.speed.ariaLabel")}
            />
          ) : (
            <NotEnough />
          )}
        </Card>

        {/* 3. Monatsverlauf */}
        <Card
          title={t("cards.month.title")}
          subtitle={t("cards.month.subtitle")}
        >
          {enoughForPage && months.length > 0 ? (
            <MonthChart months={months} />
          ) : (
            <NotEnough />
          )}
        </Card>

        {/* 4. Wochentagsmuster */}
        <Card
          title={t("cards.weekday.title")}
          subtitle={t("cards.weekday.subtitle")}
        >
          {enoughForPage ? (
            <WeekdayChart days={weekdays} />
          ) : (
            <NotEnough />
          )}
        </Card>

        {/* 5. Kurzstrecken-Anteil (nur bei relevantem Anteil) */}
        {showShortTrip && (
          <Card
            title={t("cards.shortTrip.title")}
            subtitle={t("cards.shortTrip.subtitle")}
          >
            <ShortTripDonut
              shortShare={shortTrip.shortShare}
              shortCount={shortTrip.shortCount}
              totalCount={shortTrip.totalCount}
              shortMeanConsumption={shortTrip.shortMeanConsumption}
              overallMeanConsumption={shortTrip.overallMeanConsumption}
            />
          </Card>
        )}
      </div>
    </div>
  );
}
