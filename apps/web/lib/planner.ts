import "server-only";
import { and, desc, eq } from "drizzle-orm";
import {
  chargePoints,
  chargeSessions,
  places,
  vehicleStatus,
  vehicles,
} from "@tripatlas/db";
import {
  DEFAULT_EFFECTIVE_DC_POWER_KW,
  DEFAULT_REFERENCE_SPEED_KMH,
  binByNumeric,
  type RoadtripChargeModel,
} from "@tripatlas/core";
import { db } from "./db";
import { getInsightsData } from "./insights";

/**
 * Datenzugriffs-Schicht für den Routenplaner-MVP („Reichweiten-Check"). Lädt
 * den persönlichen Basisverbrauch aus der Fahrten-Historie (Muster wie
 * lib/insights.ts), schätzt die nutzbare Batteriekapazität aus dem
 * vehicle_status und bündelt den Vorbelegungs-Kontext für die Formularseite.
 * Die reine Rechenlogik liegt in @tripatlas/core (planner/*), hier passiert nur
 * das Laden/Aufbereiten der DB-Daten.
 */

/** Bin-Breite der Temperatur-Bins für den Basisverbrauch (°C) — wie Insights. */
export const BASE_TEMP_BIN_WIDTH_C = 5;

/**
 * Absoluter Notnagel-Basisverbrauch (Wh/km), falls weder Historie noch
 * Fahrzeug-Effizienz einen Wert liefern (z. B. frische Installation). Bewusst
 * eher hoch angesetzt, damit die Prognose im Zweifel nicht zu optimistisch ist.
 */
export const LAST_RESORT_BASE_WH_PER_KM = 170;

/**
 * Default-Batteriekapazität (kWh), wenn sie sich nicht aus rated range + SoC +
 * Effizienz herleiten lässt. 75 kWh ≈ mittleres Tesla-Paket.
 */
export const DEFAULT_BATTERY_CAPACITY_KWH = 75;

// Plausibilitätsfenster für die hergeleitete Kapazität. Liegt der Schätzwert
// außerhalb (z. B. weil der SoC gerade sehr niedrig ist und rated range grob
// gerundet), verwerfen wir ihn zugunsten des Defaults.
const MIN_PLAUSIBLE_CAPACITY_KWH = 30;
const MAX_PLAUSIBLE_CAPACITY_KWH = 200;

export type BaseConsumptionSource =
  | "temp-bin"
  | "history-avg"
  | "vehicle-efficiency"
  | "default";

export interface BaseConsumptionResult {
  /** Basisverbrauch in Wh/km bei der angefragten Temperatur. */
  baseWhPerKm: number;
  /** Woher der Wert stammt — wird in der UI unter „Annahmen" ausgewiesen. */
  source: BaseConsumptionSource;
  /** Historische Ø-Geschwindigkeit (km/h) als Referenz für die Tempo-Anpassung. */
  referenceSpeedKmh: number;
  /** Mitte des getroffenen Temperatur-Bins (°C), null falls kein Bin griff. */
  tempBinCenterC: number | null;
  /** Anzahl auswertbarer Fahrten in der Historie. */
  historyDriveCount: number;
}

export interface ChargingProfileResult {
  model: RoadtripChargeModel;
  source: "history-dc-curve" | "history-dc-average" | "default";
  sessionCount: number;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

/**
 * Builds a local fast-charging model from the vehicle's own TeslaMate data.
 * Ten-percent SoC bins preserve taper behavior; a median session-average or a
 * conservative default fills sparsely sampled sections.
 */
export async function resolveChargingProfile(
  vehicleId: number,
): Promise<ChargingProfileResult> {
  const [pointRows, sessionRows] = await Promise.all([
    db
      .select({
        sessionId: chargePoints.chargeSessionId,
        soc: chargePoints.soc,
        powerKw: chargePoints.powerKw,
      })
      .from(chargePoints)
      .innerJoin(
        chargeSessions,
        eq(chargePoints.chargeSessionId, chargeSessions.id),
      )
      .where(
        and(
          eq(chargeSessions.vehicleId, vehicleId),
          eq(chargeSessions.chargerType, "dc"),
        ),
      )
      .orderBy(desc(chargePoints.ts))
      .limit(5000),
    db
      .select({
        id: chargeSessions.id,
        energyAddedKwh: chargeSessions.energyAddedKwh,
        durationSeconds: chargeSessions.durationSeconds,
      })
      .from(chargeSessions)
      .where(
        and(
          eq(chargeSessions.vehicleId, vehicleId),
          eq(chargeSessions.chargerType, "dc"),
        ),
      )
      .orderBy(desc(chargeSessions.startTime))
      .limit(50),
  ]);

  const effectiveSessionPowers = sessionRows
    .map((session) => {
      if (
        session.energyAddedKwh == null ||
        session.durationSeconds == null ||
        session.energyAddedKwh < 1 ||
        session.durationSeconds < 5 * 60
      ) {
        return null;
      }
      const power = session.energyAddedKwh / (session.durationSeconds / 3600);
      return power >= 5 && power <= 300 ? power : null;
    })
    .filter((power): power is number => power != null);

  const usablePoints = pointRows.filter(
    (point): point is typeof point & { soc: number; powerKw: number } =>
      point.soc != null &&
      point.powerKw != null &&
      point.soc >= 0 &&
      point.soc <= 100 &&
      point.powerKw >= 5 &&
      point.powerKw <= 350,
  );
  const powersByBin = new Map<number, number[]>();
  for (const point of usablePoints) {
    const minSoc = Math.min(90, Math.floor(point.soc / 10) * 10);
    const values = powersByBin.get(minSoc) ?? [];
    values.push(point.powerKw);
    powersByBin.set(minSoc, values);
  }
  const bins = [...powersByBin.entries()]
    .map(([minSoc, values]) => ({
      minSoc,
      maxSoc: minSoc + 10,
      powerKw: median(values)!,
      sampleCount: values.length,
    }))
    .filter((bin) => bin.sampleCount >= 3)
    .sort((a, b) => a.minSoc - b.minSoc);

  const pointMedian = median(usablePoints.map((point) => point.powerKw));
  const sessionMedian = median(effectiveSessionPowers);
  const fallbackPowerKw =
    sessionMedian ?? pointMedian ?? DEFAULT_EFFECTIVE_DC_POWER_KW;
  const sessionCount = new Set([
    ...pointRows.map((point) => point.sessionId),
    ...sessionRows.map((session) => session.id),
  ]).size;

  return {
    model: { fallbackPowerKw, bins },
    source:
      bins.length > 0
        ? "history-dc-curve"
        : sessionMedian != null
          ? "history-dc-average"
          : "default",
    sessionCount,
  };
}

/** Fahrzeug-Effizienz in Wh/km (efficiency mit Override-Fallback), oder null. */
async function loadVehicleEfficiencyWhPerKm(
  vehicleId: number,
): Promise<number | null> {
  const rows = await db
    .select({
      efficiencyKwhPerKm: vehicles.efficiencyKwhPerKm,
      efficiencyOverrideKwhPerKm: vehicles.efficiencyOverrideKwhPerKm,
    })
    .from(vehicles)
    .where(eq(vehicles.id, vehicleId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  // Gelernte Effizienz hat Vorrang; der user-owned Override greift nur, solange
  // TeslaMate noch keine Effizienz aus Ladevorgängen gelernt hat (Schema-Kommentar).
  const eff = row.efficiencyKwhPerKm ?? row.efficiencyOverrideKwhPerKm;
  return eff != null ? eff * 1000 : null;
}

/**
 * Ermittelt den Basisverbrauch (Wh/km) für die gegebene Temperatur über die
 * Fallback-Kette:
 *   1. Temperatur-Bin-Ø der Historie (bester, weil temperaturangepasst),
 *   2. Gesamt-Ø der Historie,
 *   3. Fahrzeug-Effizienz · 1000,
 *   4. absoluter Notnagel-Konstante.
 * Liefert zusätzlich die historische Ø-Geschwindigkeit als Referenz für die
 * Tempo-Anpassung im core-Modell.
 */
export async function resolveBaseConsumption(
  vehicleId: number,
  tempC: number,
): Promise<BaseConsumptionResult> {
  const { drives } = await getInsightsData(vehicleId);

  // Gesamt-Durchschnitte über alle auswertbaren Fahrten.
  let consSum = 0;
  let consCount = 0;
  let speedSum = 0;
  let speedCount = 0;
  for (const d of drives) {
    consSum += d.avgConsumptionWhKm;
    consCount += 1;
    if (d.avgSpeedKmh != null) {
      speedSum += d.avgSpeedKmh;
      speedCount += 1;
    }
  }
  const overallAvgWhPerKm = consCount > 0 ? consSum / consCount : null;
  const referenceSpeedKmh =
    speedCount > 0 ? speedSum / speedCount : DEFAULT_REFERENCE_SPEED_KMH;

  // Temperatur-Bins (mit denselben Schwellwerten wie die Insights-Seite).
  const tempBins = binByNumeric(
    drives,
    (d) => d.tempC,
    (d) => d.avgConsumptionWhKm,
    BASE_TEMP_BIN_WIDTH_C,
  );
  const matchedBin = tempBins.find(
    (b) => tempC >= b.xStart && tempC < b.xStart + BASE_TEMP_BIN_WIDTH_C,
  );

  if (matchedBin) {
    return {
      baseWhPerKm: matchedBin.meanY,
      source: "temp-bin",
      referenceSpeedKmh,
      tempBinCenterC: matchedBin.xCenter,
      historyDriveCount: drives.length,
    };
  }
  if (overallAvgWhPerKm != null) {
    return {
      baseWhPerKm: overallAvgWhPerKm,
      source: "history-avg",
      referenceSpeedKmh,
      tempBinCenterC: null,
      historyDriveCount: drives.length,
    };
  }

  const vehicleEff = await loadVehicleEfficiencyWhPerKm(vehicleId);
  if (vehicleEff != null) {
    return {
      baseWhPerKm: vehicleEff,
      source: "vehicle-efficiency",
      referenceSpeedKmh,
      tempBinCenterC: null,
      historyDriveCount: drives.length,
    };
  }

  return {
    baseWhPerKm: LAST_RESORT_BASE_WH_PER_KM,
    source: "default",
    referenceSpeedKmh,
    tempBinCenterC: null,
    historyDriveCount: drives.length,
  };
}

export interface BatteryCapacityResult {
  capacityKwh: number;
  source: "derived" | "default";
}

/**
 * Schätzt die nutzbare Batteriekapazität. Wenn rated range, aktueller SoC und
 * Fahrzeug-Effizienz vorliegen:
 *   Kapazität ≈ (ratedRange / (SoC/100)) · Effizienz[kWh/km].
 * (rated range hochgerechnet auf 100 % SoC · kWh je km.) Liegt der Wert außer-
 * halb des Plausibilitätsfensters oder fehlen Daten, greift der Default (75 kWh).
 */
export async function estimateBatteryCapacity(
  vehicleId: number,
): Promise<BatteryCapacityResult> {
  const rows = await db
    .select({ soc: vehicleStatus.soc, ratedRangeKm: vehicleStatus.ratedRangeKm })
    .from(vehicleStatus)
    .where(eq(vehicleStatus.vehicleId, vehicleId))
    .limit(1);
  const status = rows[0];
  const effKwhPerKm = await loadVehicleEfficiencyKwhPerKm(vehicleId);

  if (
    status?.soc != null &&
    status.soc > 0 &&
    status.ratedRangeKm != null &&
    effKwhPerKm != null
  ) {
    const ratedRangeAtFull = status.ratedRangeKm / (status.soc / 100);
    const capacityKwh = ratedRangeAtFull * effKwhPerKm;
    if (
      capacityKwh >= MIN_PLAUSIBLE_CAPACITY_KWH &&
      capacityKwh <= MAX_PLAUSIBLE_CAPACITY_KWH
    ) {
      return { capacityKwh, source: "derived" };
    }
  }

  return { capacityKwh: DEFAULT_BATTERY_CAPACITY_KWH, source: "default" };
}

/** Fahrzeug-Effizienz in kWh/km (efficiency mit Override-Fallback), oder null. */
async function loadVehicleEfficiencyKwhPerKm(
  vehicleId: number,
): Promise<number | null> {
  const whPerKm = await loadVehicleEfficiencyWhPerKm(vehicleId);
  return whPerKm != null ? whPerKm / 1000 : null;
}

export interface PlannerPlace {
  id: number;
  name: string;
  type: "home" | "work" | "customer" | "charger" | "other";
  lat: number;
  lon: number;
}

/** Alle Orte mit Koordinaten — für die Start-/Ziel-Dropdowns des Planers. */
export async function getPlannerPlaces(): Promise<PlannerPlace[]> {
  const rows = await db
    .select({
      id: places.id,
      name: places.name,
      type: places.type,
      lat: places.lat,
      lon: places.lon,
    })
    .from(places)
    .orderBy(places.name);
  return rows;
}

export interface PlannerStatus {
  soc: number | null;
  lat: number | null;
  lon: number | null;
  ratedRangeKm: number | null;
  hasPosition: boolean;
}

export interface PlannerContext {
  status: PlannerStatus | null;
  /** Vorschlagswert für das Kapazitätsfeld (hergeleitet oder Default). */
  suggestedCapacityKwh: number;
  capacityIsDerived: boolean;
  /** Anzahl auswertbarer Fahrten — steuert den Hinweis, wie belastbar der Basiswert ist. */
  historyDriveCount: number;
}

/**
 * Bündelt den Kontext, den die Formularseite zum Vorbelegen braucht: aktueller
 * Fahrzeugstatus (Position/SoC), Kapazitätsvorschlag und Historie-Umfang.
 */
export async function getPlannerContext(
  vehicleId: number,
): Promise<PlannerContext> {
  const [statusRows, capacity, insights] = await Promise.all([
    db
      .select({
        soc: vehicleStatus.soc,
        lat: vehicleStatus.lat,
        lon: vehicleStatus.lon,
        ratedRangeKm: vehicleStatus.ratedRangeKm,
      })
      .from(vehicleStatus)
      .where(eq(vehicleStatus.vehicleId, vehicleId))
      .limit(1),
    estimateBatteryCapacity(vehicleId),
    getInsightsData(vehicleId),
  ]);

  const s = statusRows[0];
  const status: PlannerStatus | null = s
    ? {
        soc: s.soc,
        lat: s.lat,
        lon: s.lon,
        ratedRangeKm: s.ratedRangeKm,
        hasPosition: s.lat != null && s.lon != null,
      }
    : null;

  return {
    status,
    suggestedCapacityKwh: capacity.capacityKwh,
    capacityIsDerived: capacity.source === "derived",
    historyDriveCount: insights.drives.length,
  };
}
