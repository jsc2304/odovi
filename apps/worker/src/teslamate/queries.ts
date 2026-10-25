import type { TeslamateSql } from "./client.js";

// TeslaMate speichert alle Zeitstempel als `timestamp without time zone` in UTC.
// postgres.js würde naive Timestamps als Lokalzeit parsen — deshalb wird in
// jeder Query mit `AT TIME ZONE 'UTC'` explizit nach timestamptz gecastet.

export interface TmCar {
  id: number;
  name: string | null;
  vin: string | null;
  model: string | null;
  trim_badging: string | null;
  efficiency: number | null;
}

export interface TmDrive {
  id: number;
  car_id: number;
  start_time: Date;
  end_time: Date | null;
  start_km: number | null;
  end_km: number | null;
  distance: number | null;
  duration_min: number | null;
  ascent: number | null;
  descent: number | null;
  start_rated_range_km: number | null;
  end_rated_range_km: number | null;
  start_lat: number | null;
  start_lon: number | null;
  end_lat: number | null;
  end_lon: number | null;
  start_soc: number | null;
  end_soc: number | null;
  start_address: string | null;
  end_address: string | null;
  outside_temp_avg: number | null;
  inside_temp_avg: number | null;
  speed_max: number | null;
  power_max: number | null;
  power_min: number | null;
}

export async function fetchCars(sql: TeslamateSql): Promise<TmCar[]> {
  return sql<TmCar[]>`
    SELECT id, name, vin, model, trim_badging, efficiency::float8 AS efficiency
    FROM cars
    ORDER BY id
  `;
}

// Lesbares Adress-Label: OSM-Name (POI), sonst "Straße Hausnummer, Ort",
// sonst display_name. NULLIF räumt leere Strings weg.
export const addressLabel = (alias: string) => `
  COALESCE(
    NULLIF(${alias}.name, ''),
    NULLIF(
      trim(concat_ws(' ', ${alias}.road, ${alias}.house_number))
        || COALESCE(', ' || NULLIF(${alias}.city, ''), ''),
      ''
    ),
    ${alias}.display_name
  )`;

function driveSelect(sql: TeslamateSql, where: string, params: (Date | number)[]) {
  return sql.unsafe<TmDrive[]>(
    `
    SELECT
      d.id,
      d.car_id,
      d.start_date AT TIME ZONE 'UTC' AS start_time,
      d.end_date   AT TIME ZONE 'UTC' AS end_time,
      d.start_km::float8 AS start_km,
      d.end_km::float8   AS end_km,
      d.distance::float8 AS distance,
      d.duration_min,
      d.ascent,
      d.descent,
      d.start_rated_range_km::float8 AS start_rated_range_km,
      d.end_rated_range_km::float8   AS end_rated_range_km,
      sp.latitude::float8  AS start_lat,
      sp.longitude::float8 AS start_lon,
      ep.latitude::float8  AS end_lat,
      ep.longitude::float8 AS end_lon,
      COALESCE(sp.usable_battery_level, sp.battery_level) AS start_soc,
      COALESCE(ep.usable_battery_level, ep.battery_level) AS end_soc,
      ${addressLabel("sa")} AS start_address,
      ${addressLabel("ea")} AS end_address,
      d.outside_temp_avg::float8 AS outside_temp_avg,
      d.inside_temp_avg::float8  AS inside_temp_avg,
      d.speed_max,
      d.power_max,
      d.power_min
    FROM drives d
    LEFT JOIN positions sp ON sp.id = d.start_position_id
    LEFT JOIN positions ep ON ep.id = d.end_position_id
    LEFT JOIN addresses sa ON sa.id = d.start_address_id
    LEFT JOIN addresses ea ON ea.id = d.end_address_id
    WHERE ${where}
    ORDER BY d.start_date
    `,
    params,
  );
}

export function fetchCompletedDrivesSince(
  sql: TeslamateSql,
  since: Date,
): Promise<TmDrive[]> {
  return driveSelect(
    sql,
    `d.end_date IS NOT NULL AND d.end_date AT TIME ZONE 'UTC' > $1`,
    [since],
  );
}

export function fetchInProgressDrives(sql: TeslamateSql): Promise<TmDrive[]> {
  return driveSelect(sql, `d.end_date IS NULL`, []);
}

export interface TmChargingProcess {
  id: number;
  car_id: number;
  start_time: Date;
  end_time: Date | null;
  charge_energy_added: number | null;
  charge_energy_used: number | null;
  start_battery_level: number | null;
  end_battery_level: number | null;
  end_rated_range_km: number | null;
  duration_min: number | null;
  cost: number | null;
  lat: number | null;
  lon: number | null;
  address: string | null;
  max_power_kw: number | null;
  avg_power_kw: number | null;
  is_dc: boolean | null;
  outside_temp_avg: number | null;
}

function chargingProcessSelect(
  sql: TeslamateSql,
  where: string,
  params: (Date | number)[],
) {
  return sql.unsafe<TmChargingProcess[]>(
    `
    SELECT
      cp.id,
      cp.car_id,
      cp.start_date AT TIME ZONE 'UTC' AS start_time,
      cp.end_date   AT TIME ZONE 'UTC' AS end_time,
      cp.charge_energy_added::float8 AS charge_energy_added,
      cp.charge_energy_used::float8  AS charge_energy_used,
      cp.start_battery_level,
      cp.end_battery_level,
      cp.end_rated_range_km::float8 AS end_rated_range_km,
      cp.duration_min,
      cp.cost::float8 AS cost,
      p.latitude::float8  AS lat,
      p.longitude::float8 AS lon,
      ${addressLabel("a")} AS address,
      c.max_power_kw,
      c.avg_power_kw,
      c.is_dc,
      c.outside_temp_avg
    FROM charging_processes cp
    LEFT JOIN positions p ON p.id = cp.position_id
    LEFT JOIN addresses a ON a.id = cp.address_id
    LEFT JOIN LATERAL (
      SELECT
        MAX(ch.charger_power)::float8 AS max_power_kw,
        AVG(ch.charger_power) FILTER (WHERE ch.charger_power > 0)::float8 AS avg_power_kw,
        BOOL_OR(ch.fast_charger_present) AS is_dc,
        AVG(ch.outside_temp)::float8 AS outside_temp_avg
      FROM charges ch
      WHERE ch.charging_process_id = cp.id
    ) c ON true
    WHERE ${where}
    ORDER BY cp.start_date
    `,
    params,
  );
}

export function fetchCompletedChargingProcessesSince(
  sql: TeslamateSql,
  since: Date,
): Promise<TmChargingProcess[]> {
  return chargingProcessSelect(
    sql,
    `cp.end_date IS NOT NULL AND cp.end_date AT TIME ZONE 'UTC' > $1`,
    [since],
  );
}

export function fetchInProgressChargingProcesses(
  sql: TeslamateSql,
): Promise<TmChargingProcess[]> {
  return chargingProcessSelect(sql, `cp.end_date IS NULL`, []);
}

export interface TmGeofence {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
}

export function fetchGeofences(sql: TeslamateSql): Promise<TmGeofence[]> {
  return sql<TmGeofence[]>`
    SELECT id, name, latitude::float8 AS latitude, longitude::float8 AS longitude, radius
    FROM geofences
    ORDER BY id
  `;
}

export interface TmPosition {
  date: Date;
  latitude: number;
  longitude: number;
  speed: number | null;
  odometer: number | null;
  soc: number | null;
}

export function fetchPositionsForDrive(
  sql: TeslamateSql,
  carId: number,
  start: Date,
  end: Date,
): Promise<TmPosition[]> {
  return sql.unsafe<TmPosition[]>(
    `
    SELECT
      date AT TIME ZONE 'UTC' AS date,
      latitude::float8  AS latitude,
      longitude::float8 AS longitude,
      speed,
      odometer::float8 AS odometer,
      COALESCE(usable_battery_level, battery_level) AS soc
    FROM positions
    WHERE car_id = $1 AND date AT TIME ZONE 'UTC' BETWEEN $2 AND $3
    ORDER BY date
    `,
    [carId, start, end],
  );
}

export interface TmLatestPosition {
  car_id: number;
  date: Date;
  latitude: number;
  longitude: number;
  soc: number | null;
  rated_range_km: number | null;
  odometer: number | null;
  tpms_pressure_fl: number | null;
  tpms_pressure_fr: number | null;
  tpms_pressure_rl: number | null;
  tpms_pressure_rr: number | null;
}

/** Neueste Position pro Fahrzeug — für die Startseite (vehicle_status). */
export function fetchLatestPositions(
  sql: TeslamateSql,
): Promise<TmLatestPosition[]> {
  return sql<TmLatestPosition[]>`
    SELECT DISTINCT ON (car_id)
      car_id,
      date AT TIME ZONE 'UTC' AS date,
      latitude::float8  AS latitude,
      longitude::float8 AS longitude,
      COALESCE(usable_battery_level, battery_level) AS soc,
      rated_battery_range_km::float8 AS rated_range_km,
      odometer::float8 AS odometer,
      tpms_pressure_fl::float8 AS tpms_pressure_fl,
      tpms_pressure_fr::float8 AS tpms_pressure_fr,
      tpms_pressure_rl::float8 AS tpms_pressure_rl,
      tpms_pressure_rr::float8 AS tpms_pressure_rr
    FROM positions
    ORDER BY car_id, date DESC
  `;
}

export interface TmLatestState {
  car_id: number;
  state: string;
  start_date: Date;
}

/** Neuester State pro Fahrzeug — für die Startseite (vehicle_status). */
export function fetchLatestStates(sql: TeslamateSql): Promise<TmLatestState[]> {
  return sql<TmLatestState[]>`
    SELECT DISTINCT ON (car_id)
      car_id,
      state,
      start_date AT TIME ZONE 'UTC' AS start_date
    FROM states
    ORDER BY car_id, start_date DESC
  `;
}

export interface TmCharge {
  date: Date;
  charger_power: number | null;
  soc: number | null;
  outside_temp: number | null;
}

/** Einzelmesspunkte eines Ladevorgangs — Basis für die Ladekurve (charge_points). */
export function fetchChargesForProcess(
  sql: TeslamateSql,
  chargingProcessId: number,
): Promise<TmCharge[]> {
  return sql<TmCharge[]>`
    SELECT
      date AT TIME ZONE 'UTC' AS date,
      charger_power::float8 AS charger_power,
      COALESCE(usable_battery_level, battery_level) AS soc,
      outside_temp::float8 AS outside_temp
    FROM charges
    WHERE charging_process_id = ${chargingProcessId}
    ORDER BY date
  `;
}

export interface TmUpdate {
  id: number;
  car_id: number;
  start_time: Date;
  end_time: Date | null;
  version: string | null;
}

/** Software-Update-Historie — kleine Tabelle, Komplett-Fetch je Zyklus. */
export function fetchUpdates(sql: TeslamateSql): Promise<TmUpdate[]> {
  return sql<TmUpdate[]>`
    SELECT
      id,
      car_id,
      start_date AT TIME ZONE 'UTC' AS start_time,
      end_date   AT TIME ZONE 'UTC' AS end_time,
      version
    FROM updates
    ORDER BY id
  `;
}
