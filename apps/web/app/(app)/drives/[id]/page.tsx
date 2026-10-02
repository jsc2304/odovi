import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import {
  formatConsumption,
  formatDuration,
  formatKm,
  formatKw,
  formatKwh,
  formatOdometer,
  formatPlaceLabel,
  formatSoc,
  formatSpeed,
  formatTemp,
  formatTimeRange,
} from "@odovi/core";
import { weatherCodeIcon, weatherCodeKey } from "../../../../lib/weatherCodes";
import { APP_TIMEZONE } from "../../../../lib/config";
import { archiveReturnTo } from "../../../../lib/archiveContext";
import { formatLongDate } from "../../../../lib/day";
import {
  getAllPlacesLite,
  getAllTags,
  getAuditLogFor,
  getDriveById,
} from "../../../../lib/queries";
import { getRoutePoints } from "../../../../lib/driveRoute";
import {
  CLASSIFICATION_BADGE,
  type Classification,
} from "../../../../lib/classification";
import { buttonClasses } from "../../../../components/ui/Button";
import { AnnotationForm } from "./AnnotationForm";
import { TagManager } from "./TagManager";
import { AuditLogList } from "./AuditLogList";
import { PlaceCorrection } from "./PlaceCorrection";
import { DriveMapLoader } from "./DriveMapLoader";
import { DriveChart } from "./DriveChart";

// Ab diesem Anteil befüllter elevation_m-Werte gilt das Höhenprofil als nutzbar
// (die Chart-Komponente wendet dieselbe Schwelle intern an); darunter zeigen wir
// den Hintergrund-Hinweis und das Chart fällt auf SoC/Tempo zurück.
const MIN_ELEVATION_COVERAGE = 0.6;

export const dynamic = "force-dynamic";

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default async function DriveDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { id } = await params;
  const driveId = Number(id);
  if (!Number.isInteger(driveId) || driveId <= 0) notFound();

  const drive = await getDriveById(driveId);
  if (!drive) notFound();

  const [t, tWeather, tCommon, locale] = await Promise.all([
    getTranslations("drives"),
    getTranslations("weather"),
    getTranslations("common"),
    getLocale(),
  ]);

  const [auditEntries, allTags, allPlaces, route] = await Promise.all([
    getAuditLogFor("drive", driveId),
    getAllTags(),
    getAllPlacesLite(),
    getRoutePoints(driveId),
  ]);

  const from = formatPlaceLabel(
    drive.startPlaceName,
    drive.startAddress,
    drive.startLat,
    drive.startLon, locale,
  );
  const to = formatPlaceLabel(
    drive.endPlaceName,
    drive.endAddress,
    drive.endLat,
    drive.endLon, locale,
  );

  const dateStr = toDateParam(drive.startTime);
  const returnTo = archiveReturnTo((await searchParams).returnTo, `/day/${dateStr}?vehicle=${drive.vehicleId}#drive-${driveId}`);
  const classification = drive.classification as Classification;

  const kennzahlen: Array<[string, React.ReactNode]> = [
    [t("metrics.distance"), drive.distanceKm != null ? formatKm(drive.distanceKm, locale) : "—"],
    [
      t("metrics.duration"),
      drive.durationSeconds != null ? formatDuration(drive.durationSeconds) : "—",
    ],
    [
      t("metrics.avgConsumption"),
      drive.avgConsumptionWhKm != null
        ? formatConsumption(drive.avgConsumptionWhKm, drive.energyIsEstimated)
        : "—",
    ],
    [
      t("metrics.consumedEnergy"),
      drive.consumedEnergyKwh != null
        ? `${formatKwh(drive.consumedEnergyKwh, {}, locale)}${drive.energyIsEstimated ? " ~" : ""}`
        : "—",
    ],
    [
      t("metrics.startSoc"),
      drive.startSoc != null ? formatSoc(drive.startSoc) : "—",
    ],
    [t("metrics.endSoc"), drive.endSoc != null ? formatSoc(drive.endSoc) : "—"],
    [
      t("metrics.startOdometer"),
      drive.startOdometerKm != null ? (
        <span className="font-mono">{formatOdometer(drive.startOdometerKm, locale)}</span>
      ) : (
        "—"
      ),
    ],
    [
      t("metrics.endOdometer"),
      drive.endOdometerKm != null ? (
        <span className="font-mono">{formatOdometer(drive.endOdometerKm, locale)}</span>
      ) : (
        "—"
      ),
    ],
  ];

  if (drive.ascentM != null || drive.descentM != null) {
    kennzahlen.push([
      t("metrics.ascent"),
      drive.ascentM != null ? `${drive.ascentM} m` : "—",
    ]);
    kennzahlen.push([
      t("metrics.descent"),
      drive.descentM != null ? `${drive.descentM} m` : "—",
    ]);
  }

  // Angereicherte Kennzahlen (M18) — nur zeigen, wenn befüllt (kein „—"-Rauschen).
  if (drive.outsideTempAvg != null) {
    kennzahlen.push([t("metrics.outsideTempAvg"), formatTemp(drive.outsideTempAvg, locale)]);
  }
  if (drive.insideTempAvg != null) {
    kennzahlen.push([t("metrics.insideTempAvg"), formatTemp(drive.insideTempAvg, locale)]);
  }
  if (drive.speedMaxKmh != null) {
    kennzahlen.push([t("metrics.maxSpeed"), formatSpeed(drive.speedMaxKmh)]);
  }
  if (drive.powerMaxKw != null) {
    kennzahlen.push([t("metrics.maxPower"), formatKw(drive.powerMaxKw)]);
  }
  // powerMinKw ist negativ (stärkste Rekuperation) — positiv anzeigen.
  if (drive.powerMinKw != null && drive.powerMinKw < 0) {
    kennzahlen.push([t("metrics.maxRegen"), formatKw(drive.powerMinKw)]);
  }

  kennzahlen.push([t("metrics.startAddress"), drive.startAddress ?? "—"]);
  kennzahlen.push([t("metrics.endAddress"), drive.endAddress ?? "—"]);

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={returnTo}
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
      >
        <ChevronLeft aria-hidden size={16} />
        {tCommon("actions.back")}
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {formatLongDate(dateStr, locale)} ·{" "}
            {formatTimeRange(drive.startTime, drive.endTime, APP_TIMEZONE, locale)}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {from} <span className="text-neutral-400">→</span> {to}
          </h1>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${CLASSIFICATION_BADGE[classification]}`}
        >
          {tCommon(`classification.${classification}`)}
        </span>
      </div>

      <Link
        href={`/day/${dateStr}?vehicle=${drive.vehicleId}#drive-${driveId}`}
        className="mt-2 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 hover:underline dark:text-neutral-400 dark:hover:text-white"
      >
        {t("page.backToDayView", { date: dateStr })}
        <ChevronRight aria-hidden size={14} />
      </Link>

      {drive.weatherTempC != null &&
        (() => {
          // Wetter zur Fahrtzeit aus drives.weather_* (historisch, Open-Meteo).
          const WeatherIcon =
            drive.weatherCode != null ? weatherCodeIcon(drive.weatherCode) : null;
          const parts: string[] = [`${Math.round(drive.weatherTempC)} °C`];
          if (drive.weatherCode != null) {
            parts.push(tWeather(`code.${weatherCodeKey(drive.weatherCode)}`));
          }
          if (drive.weatherWindKmh != null) {
            parts.push(
              t("page.weatherWind", { speed: Math.round(drive.weatherWindKmh) }),
            );
          }
          return (
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-600 dark:text-neutral-300">
              {WeatherIcon && (
                <WeatherIcon
                  aria-hidden
                  size={16}
                  className="text-neutral-500 dark:text-neutral-400"
                />
              )}
              <span className="tabular-nums">{parts.join(" · ")}</span>
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                {t("page.weatherHistoricalNote")}
              </span>
            </div>
          );
        })()}

      <Card title={t("page.cardMetrics")}>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {kennzahlen.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 text-sm">
              <dt className="text-neutral-500 dark:text-neutral-400">{label}</dt>
              <dd className="text-right font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        {drive.energyIsEstimated && drive.consumedEnergyKwh != null && (
          <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
            {t("page.estimatedNote")}
          </p>
        )}
      </Card>

      <Card title={t("page.cardRoute")}>
        {route.points.length >= 2 ? (
          <>
            <DriveMapLoader points={route.points} />
            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
              {t("page.routePoints", { count: route.totalCount })}
            </p>
          </>
        ) : (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {t("page.noTrackData")}
          </p>
        )}
      </Card>

      {route.points.length >= 2 && (
        <Card title={t("page.cardCourse")}>
          <DriveChart
            points={route.chartPoints}
            elevationCoverage={route.elevationCoverage}
            teslamateAscentM={drive.ascentM}
            teslamateDescentM={drive.descentM}
          />
          {route.elevationCoverage < MIN_ELEVATION_COVERAGE && (
            <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
              {t("page.elevationBackgroundNote")}
            </p>
          )}
        </Card>
      )}

      <Card title={t("page.cardPostProcessing")}>
        <AnnotationForm
          driveId={drive.id}
          classification={classification}
          purpose={drive.purpose}
          customer={drive.customer}
          project={drive.project}
          notes={drive.notes}
        />
      </Card>

      <Card title={t("page.cardTags")}>
        <TagManager
          driveId={drive.id}
          initialTags={drive.tags}
          allTagNames={allTags.map((t) => t.name)}
        />
      </Card>

      <Card title={t("page.cardCorrectPlaces")}>
        <PlaceCorrection
          driveId={drive.id}
          start={{
            placeId: drive.startPlaceId,
            placeName: drive.startPlaceName,
            address: drive.startAddress,
            lat: drive.startLat,
            lon: drive.startLon,
            locked: drive.startPlaceLocked,
          }}
          end={{
            placeId: drive.endPlaceId,
            placeName: drive.endPlaceName,
            address: drive.endAddress,
            lat: drive.endLat,
            lon: drive.endLon,
            locked: drive.endPlaceLocked,
          }}
          allPlaces={allPlaces}
        />
      </Card>

      <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {t("page.auditHistory")}
          </summary>
          <div className="mt-3">
            <AuditLogList entries={auditEntries} />
          </div>
        </details>
      </section>

      <Card title={t("page.cardExport")}>
        <div className="flex gap-1.5">
          <a
            href={`/api/export/drive/${drive.id}?format=csv`}
            className={buttonClasses("ghost", "sm")}
          >
            <Download aria-hidden size={14} />
            CSV
          </a>
          <a
            href={`/api/export/drive/${drive.id}?format=pdf`}
            className={buttonClasses("ghost", "sm")}
          >
            <Download aria-hidden size={14} />
            PDF
          </a>
          {route.points.length >= 2 && (
            <a
              href={`/api/export/drive/${drive.id}?format=gpx`}
              className={buttonClasses("ghost", "sm")}
            >
              <Download aria-hidden size={14} />
              GPX
            </a>
          )}
        </div>
      </Card>
    </div>
  );
}

/** Renders a drive's start_time as a YYYY-MM-DD in APP_TIMEZONE for the day-view link. */
function toDateParam(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: APP_TIMEZONE,
  }).format(date);
}
