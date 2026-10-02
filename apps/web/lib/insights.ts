import "server-only";
import { and, asc, eq, gte, isNotNull } from "drizzle-orm";
import { drives } from "@odovi/db";
import { db } from "./db";
import { APP_TIMEZONE } from "./config";

/**
 * Ein für die Insights-Auswertung aufbereiteter Fahrten-Datensatz (M21).
 *
 * Nur abgeschlossene Fahrten mit distance_km >= 2 km und vorhandenem
 * avg_consumption_wh_km fließen ein — kurze Rangier-/Messrausch-Fahrten (unter
 * 2 km oder ohne Verbrauchswert) würden Temperatur-/Tempo-Korrelationen sonst
 * verzerren, deshalb bewusst herausgefiltert (vgl. M21-Spec „Rangier-Rauschen").
 *
 * `monthKey` (YYYY-MM) und `dow` (Wochentag, 0 = Montag .. 6 = Sonntag) werden
 * schon hier in APP_TIMEZONE aufgelöst, damit die reinen core-Funktionen
 * timezone-agnostisch mit fertigen Indizes rechnen können.
 */
export interface InsightDrive {
  id: number;
  startTime: Date;
  distanceKm: number;
  durationSeconds: number | null;
  avgConsumptionWhKm: number;
  energyIsEstimated: boolean;
  /** outside_temp_avg mit Fallback auf weather_temp_c. */
  tempC: number | null;
  /** Effektives Durchschnittstempo in km/h (distance/duration*3.6), null falls Dauer fehlt/0. */
  avgSpeedKmh: number | null;
  /** YYYY-MM in APP_TIMEZONE. */
  monthKey: string;
  /** 0 = Montag .. 6 = Sonntag, in APP_TIMEZONE. */
  dow: number;
}

export interface InsightsData {
  drives: InsightDrive[];
  /** Erste (früheste) Fahrt im ausgewerteten Datensatz, für die Datengrundlage-Zeile. */
  firstDriveDate: Date | null;
}

/**
 * de-DE-Wochentag (lang, z. B. "Montag") → Monday-first-Index 0..6. Für die
 * Auflösung in APP_TIMEZONE nutzen wir Intl statt UTC-getDay(), damit Fahrten
 * kurz vor/nach Mitternacht dem lokalen Kalendertag zugeordnet werden.
 */
const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  timeZone: APP_TIMEZONE,
});
const monthFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  timeZone: APP_TIMEZONE,
});
const EN_DOW: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

function dowInAppTz(date: Date): number {
  return EN_DOW[weekdayFormatter.format(date)] ?? 0;
}

function monthKeyInAppTz(date: Date): string {
  // en-CA liefert YYYY-MM-… → auf YYYY-MM kürzen.
  return monthFormatter.format(date).slice(0, 7);
}

/**
 * Lädt die für die Insights-Seite auswertbaren Fahrten eines Fahrzeugs und
 * bereitet Temperatur (mit Wetter-Fallback), Effektiv-Tempo, Monat und
 * Wochentag auf. Aufsteigend nach start_time sortiert, damit `firstDriveDate`
 * direkt die erste Zeile ist.
 */
export async function getInsightsData(vehicleId: number): Promise<InsightsData> {
  const rows = await db
    .select({
      id: drives.id,
      startTime: drives.startTime,
      distanceKm: drives.distanceKm,
      durationSeconds: drives.durationSeconds,
      avgConsumptionWhKm: drives.avgConsumptionWhKm,
      energyIsEstimated: drives.energyIsEstimated,
      outsideTempAvg: drives.outsideTempAvg,
      weatherTempC: drives.weatherTempC,
    })
    .from(drives)
    .where(
      and(
        eq(drives.vehicleId, vehicleId),
        isNotNull(drives.endTime),
        isNotNull(drives.avgConsumptionWhKm),
        gte(drives.distanceKm, 2),
      ),
    )
    .orderBy(asc(drives.startTime));

  const out: InsightDrive[] = rows.map((r) => {
    const distanceKm = r.distanceKm!;
    const avgSpeedKmh =
      r.durationSeconds != null && r.durationSeconds > 0
        ? (distanceKm / r.durationSeconds) * 3600
        : null;
    return {
      id: r.id,
      startTime: r.startTime,
      distanceKm,
      durationSeconds: r.durationSeconds,
      avgConsumptionWhKm: r.avgConsumptionWhKm!,
      energyIsEstimated: r.energyIsEstimated,
      tempC: r.outsideTempAvg ?? r.weatherTempC,
      avgSpeedKmh,
      monthKey: monthKeyInAppTz(r.startTime),
      dow: dowInAppTz(r.startTime),
    };
  });

  return {
    drives: out,
    firstDriveDate: out[0]?.startTime ?? null,
  };
}
