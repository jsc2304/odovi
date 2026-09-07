import Link from "next/link";
import {
  CalendarRange,
  Gauge,
  Lightbulb,
  Route,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import {
  MIN_DRIVES_TOTAL,
  binByNumeric,
  coldVsMildDelta,
  shortTripShare,
  weeklyPattern,
  type Bin,
} from "@odovi/core";
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
import styles from "./Insights.module.css";

export const dynamic = "force-dynamic";

const TEMP_BIN_WIDTH = 5; // °C
const SPEED_BIN_WIDTH = 10; // km/h
const SHORT_TRIP_KM = 5;
const SHORT_TRIP_MIN_SHARE = 0.1; // Karte nur zeigen, wenn Anteil > 10 %

const MONDAY_UTC_DAY = 5;

/** Card-Rahmen im gleichen Stil wie die übrigen Seiten. */
function Card({
  index,
  title,
  subtitle,
  children,
  className = "",
}: {
  index: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`${styles.card} ${className}`}>
      <header className={styles.cardHeader}>
        <span aria-hidden>{index}</span>
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </header>
      <div className={styles.cardBody}>{children}</div>
    </section>
  );
}

function HeroMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className={styles.heroMetric}>
      <Icon aria-hidden size={17} />
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
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
  const tYearly = await getTranslations("yearly");
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
  const totalDistanceKm = drives.reduce((sum, drive) => sum + drive.distanceKm, 0);
  const overallConsumption = shortTrip.overallMeanConsumption;
  const numberFormat = new Intl.NumberFormat(toIntlLocale(locale), {
    maximumFractionDigits: 0,
  });
  const basisLabel =
    total > 0 && firstDriveDate
      ? t("subtitleWithData", {
          count: total,
          date: formatFirstDate(firstDriveDate, locale),
        })
      : t("subtitleNoData");

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroRoute} aria-hidden>
          <i />
          <i />
          <i />
        </div>
        <div className={styles.heroTopline}>
          <p>
            <Sparkles aria-hidden size={14} />
            {t("hero.eyebrow")}
          </p>
          {vehicles.length > 1 && (
            <InsightsVehicleSwitcher vehicles={vehicles} current={current.id} />
          )}
        </div>
        <div className={styles.heroCopy}>
          <h1>{t("hero.title")}</h1>
          <p>{basisLabel}</p>
          <Link href="/wrapped" className="mt-3 inline-flex min-h-11 items-center text-sm font-medium underline-offset-4 hover:underline">{tYearly("wrapped.entry")}</Link>
        </div>
        <dl className={styles.heroMetrics}>
          <HeroMetric
            icon={Route}
            label={t("hero.drives")}
            value={numberFormat.format(total)}
          />
          <HeroMetric
            icon={Gauge}
            label={t("hero.distance")}
            value={`${numberFormat.format(totalDistanceKm)} km`}
          />
          <HeroMetric
            icon={Sparkles}
            label={t("hero.consumption")}
            value={
              overallConsumption == null
                ? "–"
                : `${numberFormat.format(overallConsumption)} Wh/km`
            }
          />
          <HeroMetric
            icon={CalendarRange}
            label={t("hero.months")}
            value={numberFormat.format(months.length)}
          />
        </dl>
      </section>

      {!enoughForPage && (
        <div className={styles.notice}>
          <EmptyState
            icon={Lightbulb}
            title={t("notEnoughTitle")}
            hint={t("notEnoughBannerHint", { min: MIN_DRIVES_TOTAL, count: total })}
          />
        </div>
      )}

      <div className={styles.insightGrid}>
        {/* 1. Verbrauch vs. Außentemperatur */}
        <Card
          index="01"
          title={t("cards.temp.title")}
          subtitle={enoughForPage ? tempSubtitle(tempBins, t) : undefined}
          className={styles.tempCard}
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
          index="02"
          title={t("cards.speed.title")}
          subtitle={t("cards.speed.subtitle")}
          className={styles.speedCard}
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
          index="03"
          title={t("cards.month.title")}
          subtitle={t("cards.month.subtitle")}
          className={styles.monthCard}
        >
          {enoughForPage && months.length > 0 ? (
            <MonthChart months={months} />
          ) : (
            <NotEnough />
          )}
        </Card>

        {/* 4. Wochentagsmuster */}
        <Card
          index="04"
          title={t("cards.weekday.title")}
          subtitle={t("cards.weekday.subtitle")}
          className={showShortTrip ? styles.weekdayCard : styles.fullCard}
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
            index="05"
            title={t("cards.shortTrip.title")}
            subtitle={t("cards.shortTrip.subtitle")}
            className={styles.shortTripCard}
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
