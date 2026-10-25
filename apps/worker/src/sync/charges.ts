import { sql } from "drizzle-orm";
import { chargeSessions, type Db } from "@odovi/db";
import type { TeslamateSql } from "../teslamate/client.js";
import {
  fetchCompletedChargingProcessesSince,
  fetchInProgressChargingProcesses,
  type TmChargingProcess,
} from "../teslamate/queries.js";
import { matchPlace, type MatchablePlace } from "@odovi/core";
import { getWatermark, recordSyncRun } from "./state.js";
import type { VehicleRef } from "./vehicles.js";

const SOURCE = "teslamate";
const ENTITY = "charges";
// Overlap-Rescan: TeslaMate repariert/merged Ladevorgänge gelegentlich nachträglich.
const OVERLAP_MS = 24 * 60 * 60 * 1000;
const EPOCH = new Date(0);
const CHUNK_SIZE = 200;

export interface ChargeSyncResult {
  upserted: number;
  upsertedRefs: UpsertedChargeRef[];
}

/** Für den Ladekurven-Sync: welche Charge-Sessions wurden in diesem Zyklus angefasst. */
export interface UpsertedChargeRef {
  odoviChargeSessionId: number;
  tmChargingProcessId: number;
}

export async function syncCharges(
  db: Db,
  tm: TeslamateSql,
  vehicleMap: Map<number, VehicleRef>,
  matchablePlaces: MatchablePlace[],
): Promise<ChargeSyncResult> {
  try {
    const watermark = (await getWatermark(db, SOURCE, ENTITY)) ?? EPOCH;
    const since = new Date(watermark.getTime() - OVERLAP_MS);

    const completed = await fetchCompletedChargingProcessesSince(tm, since);
    const inProgress = await fetchInProgressChargingProcesses(tm);
    const rows = [...completed, ...inProgress];

    let upserted = 0;
    const upsertedRefs: UpsertedChargeRef[] = [];
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const entries = chunk
        .map((c) => {
          const values = toChargeValues(c, vehicleMap, matchablePlaces);
          return values ? { tmCharge: c, values } : null;
        })
        .filter((e) => e !== null);
      if (entries.length === 0) continue;

      const returned = await db
        .insert(chargeSessions)
        .values(entries.map((e) => e.values))
        .onConflictDoUpdate({
          target: [chargeSessions.source, chargeSessions.sourceId],
          // Nur synced Spalten — user-owned Felder (cost, currency, notes,
          // place-Lock) bleiben unangetastet.
          set: {
            vehicleId: sql`excluded.vehicle_id`,
            startTime: sql`excluded.start_time`,
            endTime: sql`excluded.end_time`,
            lat: sql`excluded.lat`,
            lon: sql`excluded.lon`,
            address: sql`excluded.address`,
            // Gelockte Place-Zuordnung behält den bestehenden Wert (user-owned).
            placeId: sql`CASE WHEN ${chargeSessions.placeLocked} THEN ${chargeSessions.placeId} ELSE excluded.place_id END`,
            startSoc: sql`excluded.start_soc`,
            endSoc: sql`excluded.end_soc`,
            endRatedRangeKm: sql`excluded.end_rated_range_km`,
            energyAddedKwh: sql`excluded.energy_added_kwh`,
            energyUsedKwh: sql`excluded.energy_used_kwh`,
            maxPowerKw: sql`excluded.max_power_kw`,
            avgPowerKw: sql`excluded.avg_power_kw`,
            chargerType: sql`excluded.charger_type`,
            outsideTempAvg: sql`excluded.outside_temp_avg`,
            durationSeconds: sql`excluded.duration_seconds`,
            syncedAt: sql`excluded.synced_at`,
            updatedAt: sql`now()`,
          },
        })
        .returning({ id: chargeSessions.id, sourceId: chargeSessions.sourceId });

      // Reihenfolge von RETURNING bei ON CONFLICT ist nicht garantiert gleich
      // der Insert-Reihenfolge — über sourceId zurückmappen auf den TM-Ladevorgang.
      const bySourceId = new Map(entries.map((e) => [e.values.sourceId, e]));
      for (const row of returned) {
        const entry = bySourceId.get(row.sourceId);
        if (!entry) continue;
        upsertedRefs.push({
          odoviChargeSessionId: row.id,
          tmChargingProcessId: entry.tmCharge.id,
        });
      }
      upserted += entries.length;
    }

    const watermarkTs =
      completed.length > 0
        ? new Date(Math.max(...completed.map((c) => c.end_time!.getTime())))
        : watermark === EPOCH
          ? null
          : watermark;

    await recordSyncRun(db, SOURCE, ENTITY, {
      status: "ok",
      watermarkTs,
      rowsUpserted: upserted,
    });
    return { upserted, upsertedRefs };
  } catch (err) {
    await recordSyncRun(db, SOURCE, ENTITY, {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
      rowsUpserted: 0,
    });
    throw err;
  }
}

function toChargeValues(
  c: TmChargingProcess,
  vehicleMap: Map<number, VehicleRef>,
  matchablePlaces: MatchablePlace[],
) {
  const vehicle = vehicleMap.get(c.car_id);
  if (!vehicle) {
    console.warn(
      `[sync:charges] unbekannte car_id ${c.car_id}, Ladevorgang ${c.id} übersprungen`,
    );
    return null;
  }

  const durationSeconds =
    c.end_time != null
      ? Math.round((c.end_time.getTime() - c.start_time.getTime()) / 1000)
      : c.duration_min != null
        ? c.duration_min * 60
        : null;

  return {
    vehicleId: vehicle.id,
    startTime: c.start_time,
    endTime: c.end_time,
    lat: c.lat,
    lon: c.lon,
    address: c.address,
    placeId: matchPlace(c.lat, c.lon, matchablePlaces),
    startSoc: c.start_battery_level,
    endSoc: c.end_battery_level,
    endRatedRangeKm: c.end_rated_range_km,
    energyAddedKwh: c.charge_energy_added,
    energyUsedKwh: c.charge_energy_used,
    maxPowerKw: c.max_power_kw,
    avgPowerKw: c.avg_power_kw,
    chargerType: c.is_dc ? ("dc" as const) : ("ac" as const),
    outsideTempAvg: c.outside_temp_avg,
    durationSeconds,
    // cost ist user-owned: nur beim INSERT gesetzt, nie im DO UPDATE SET.
    // TeslaMate kennt keine globale currency-Spalte — bleibt null.
    cost: c.cost != null ? String(c.cost) : null,
    currency: null,
    // Provenance: TeslaMate-Kosten kommen als 'synced' rein, damit die
    // automatische Neuberechnung (chargeCosts.ts) sie nie überschreibt.
    costSource: c.cost != null ? ("synced" as const) : null,
    source: SOURCE,
    sourceId: String(c.id),
    syncedAt: new Date(),
  };
}
