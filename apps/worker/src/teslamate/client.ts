import postgres from "postgres";

export type TeslamateSql = postgres.Sql;

export const TESLAMATE_SUPPORTED_RANGE = {
  minimum: "4.0.1",
  maximum: "4.2.0",
} as const;

type RequiredColumn = {
  name: string;
  postgresType: string;
};

type RequiredRelationship = {
  column: string;
  referencesTable: string;
  referencesColumn: string;
};

type SchemaColumn = {
  table_name: string;
  column_name: string;
  udt_name: string;
};

type SchemaRelationship = {
  table_name: string;
  column_name: string;
  foreign_table_name: string;
  foreign_column_name: string;
};

/**
 * The complete TeslaMate surface read by apps/worker/src/teslamate/queries.ts.
 * PostgreSQL UDT names deliberately ignore compatible numeric precision changes
 * such as charging_processes.cost numeric(6,2) -> numeric(14,2).
 */
export const REQUIRED_TESLAMATE_COLUMNS: Readonly<
  Record<string, readonly RequiredColumn[]>
> = {
  cars: [
    { name: "id", postgresType: "int2" },
    { name: "name", postgresType: "text" },
    { name: "vin", postgresType: "text" },
    { name: "model", postgresType: "varchar" },
    { name: "trim_badging", postgresType: "text" },
    { name: "efficiency", postgresType: "float8" },
  ],
  drives: [
    { name: "id", postgresType: "int4" },
    { name: "car_id", postgresType: "int2" },
    { name: "start_date", postgresType: "timestamp" },
    { name: "end_date", postgresType: "timestamp" },
    { name: "start_km", postgresType: "float8" },
    { name: "end_km", postgresType: "float8" },
    { name: "distance", postgresType: "float8" },
    { name: "duration_min", postgresType: "int2" },
    { name: "ascent", postgresType: "int2" },
    { name: "descent", postgresType: "int2" },
    { name: "start_rated_range_km", postgresType: "numeric" },
    { name: "end_rated_range_km", postgresType: "numeric" },
    { name: "start_position_id", postgresType: "int4" },
    { name: "end_position_id", postgresType: "int4" },
    { name: "start_address_id", postgresType: "int4" },
    { name: "end_address_id", postgresType: "int4" },
    { name: "outside_temp_avg", postgresType: "numeric" },
    { name: "inside_temp_avg", postgresType: "numeric" },
    { name: "speed_max", postgresType: "int2" },
    { name: "power_max", postgresType: "int2" },
    { name: "power_min", postgresType: "int2" },
  ],
  positions: [
    { name: "id", postgresType: "int4" },
    { name: "car_id", postgresType: "int2" },
    { name: "date", postgresType: "timestamp" },
    { name: "latitude", postgresType: "numeric" },
    { name: "longitude", postgresType: "numeric" },
    { name: "speed", postgresType: "int2" },
    { name: "odometer", postgresType: "float8" },
    { name: "battery_level", postgresType: "int2" },
    { name: "usable_battery_level", postgresType: "int2" },
    { name: "rated_battery_range_km", postgresType: "numeric" },
    { name: "tpms_pressure_fl", postgresType: "numeric" },
    { name: "tpms_pressure_fr", postgresType: "numeric" },
    { name: "tpms_pressure_rl", postgresType: "numeric" },
    { name: "tpms_pressure_rr", postgresType: "numeric" },
  ],
  addresses: [
    { name: "id", postgresType: "int4" },
    { name: "name", postgresType: "varchar" },
    { name: "road", postgresType: "varchar" },
    { name: "house_number", postgresType: "varchar" },
    { name: "city", postgresType: "varchar" },
    { name: "display_name", postgresType: "varchar" },
  ],
  charging_processes: [
    { name: "id", postgresType: "int4" },
    { name: "car_id", postgresType: "int2" },
    { name: "start_date", postgresType: "timestamp" },
    { name: "end_date", postgresType: "timestamp" },
    { name: "charge_energy_added", postgresType: "numeric" },
    { name: "charge_energy_used", postgresType: "numeric" },
    { name: "start_battery_level", postgresType: "int2" },
    { name: "end_battery_level", postgresType: "int2" },
    { name: "end_rated_range_km", postgresType: "numeric" },
    { name: "duration_min", postgresType: "int2" },
    { name: "cost", postgresType: "numeric" },
    { name: "position_id", postgresType: "int4" },
    { name: "address_id", postgresType: "int4" },
  ],
  charges: [
    { name: "charging_process_id", postgresType: "int4" },
    { name: "charger_power", postgresType: "int2" },
    { name: "fast_charger_present", postgresType: "bool" },
    { name: "date", postgresType: "timestamp" },
    { name: "battery_level", postgresType: "int2" },
    { name: "usable_battery_level", postgresType: "int2" },
    { name: "outside_temp", postgresType: "numeric" },
  ],
  geofences: [
    { name: "id", postgresType: "int4" },
    { name: "name", postgresType: "varchar" },
    { name: "latitude", postgresType: "numeric" },
    { name: "longitude", postgresType: "numeric" },
    { name: "radius", postgresType: "int2" },
  ],
  states: [
    { name: "car_id", postgresType: "int2" },
    { name: "state", postgresType: "states_status" },
    { name: "start_date", postgresType: "timestamp" },
  ],
  updates: [
    { name: "id", postgresType: "int4" },
    { name: "car_id", postgresType: "int2" },
    { name: "start_date", postgresType: "timestamp" },
    { name: "end_date", postgresType: "timestamp" },
    { name: "version", postgresType: "varchar" },
  ],
};

export const REQUIRED_TESLAMATE_RELATIONSHIPS: Readonly<
  Record<string, readonly RequiredRelationship[]>
> = {
  drives: [
    { column: "car_id", referencesTable: "cars", referencesColumn: "id" },
    { column: "start_position_id", referencesTable: "positions", referencesColumn: "id" },
    { column: "end_position_id", referencesTable: "positions", referencesColumn: "id" },
    { column: "start_address_id", referencesTable: "addresses", referencesColumn: "id" },
    { column: "end_address_id", referencesTable: "addresses", referencesColumn: "id" },
  ],
  positions: [
    { column: "car_id", referencesTable: "cars", referencesColumn: "id" },
  ],
  charging_processes: [
    { column: "car_id", referencesTable: "cars", referencesColumn: "id" },
    { column: "position_id", referencesTable: "positions", referencesColumn: "id" },
    { column: "address_id", referencesTable: "addresses", referencesColumn: "id" },
  ],
  charges: [
    {
      column: "charging_process_id",
      referencesTable: "charging_processes",
      referencesColumn: "id",
    },
  ],
  states: [
    { column: "car_id", referencesTable: "cars", referencesColumn: "id" },
  ],
  updates: [
    { column: "car_id", referencesTable: "cars", referencesColumn: "id" },
  ],
};

export function createTeslamateClient(url: string): TeslamateSql {
  return postgres(url, {
    max: 2,
    // Wir lesen nur — falls die Rolle doch Schreibrechte hat, schützt das
    // zumindest vor versehentlichen Writes über diese Connection.
    connection: { default_transaction_read_only: true },
  });
}

export function assertTeslamateSchemaCompatibility(
  columns: readonly SchemaColumn[],
  relationships: readonly SchemaRelationship[],
): void {
  const actualColumns = new Map(
    columns.map((column) => [
      `${column.table_name}.${column.column_name}`,
      column.udt_name,
    ]),
  );
  const missingColumns: string[] = [];
  const wrongTypes: string[] = [];

  for (const [table, requiredColumns] of Object.entries(REQUIRED_TESLAMATE_COLUMNS)) {
    for (const column of requiredColumns) {
      const key = `${table}.${column.name}`;
      const actualType = actualColumns.get(key);
      if (actualType == null) missingColumns.push(key);
      else if (actualType !== column.postgresType) {
        wrongTypes.push(`${key} (${actualType}, erwartet ${column.postgresType})`);
      }
    }
  }

  const actualRelationships = new Set(
    relationships.map(
      (relationship) =>
        `${relationship.table_name}.${relationship.column_name}->` +
        `${relationship.foreign_table_name}.${relationship.foreign_column_name}`,
    ),
  );
  const missingRelationships: string[] = [];
  for (const [table, requiredRelationships] of Object.entries(
    REQUIRED_TESLAMATE_RELATIONSHIPS,
  )) {
    for (const relationship of requiredRelationships) {
      const key =
        `${table}.${relationship.column}->` +
        `${relationship.referencesTable}.${relationship.referencesColumn}`;
      if (!actualRelationships.has(key)) missingRelationships.push(key);
    }
  }

  const details = [
    missingColumns.length > 0
      ? `fehlende Tabellen/Spalten: ${missingColumns.join(", ")}`
      : null,
    wrongTypes.length > 0 ? `inkompatible Typen: ${wrongTypes.join(", ")}` : null,
    missingRelationships.length > 0
      ? `fehlende Beziehungen: ${missingRelationships.join(", ")}`
      : null,
  ].filter((detail): detail is string => detail != null);

  if (details.length > 0) {
    throw new Error(
      `TeslaMate-Kompatibilitätsprüfung fehlgeschlagen (${details.join("; ")}). ` +
        `Odovi unterstützt TeslaMate v${TESLAMATE_SUPPORTED_RANGE.minimum} bis ` +
        `v${TESLAMATE_SUPPORTED_RANGE.maximum} und stoppt vor der Synchronisierung. ` +
        "Prüfe die verbundene Datenbank und TeslaMate-Version; Details: " +
        "docs/teslamate-compatibility.md.",
    );
  }
}

/**
 * Prüft beim Start, ob die TeslaMate-DB die erwarteten Spalten hat.
 * TeslaMate-Migrationen benennen gelegentlich um — lieber ein klarer
 * Fehler beim Start als stiller Datenmüll.
 */
export async function probeTeslamateSchema(sql: TeslamateSql): Promise<void> {
  const columns = await sql<SchemaColumn[]>`
    SELECT table_name, column_name, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `;
  // table_constraints hides foreign keys from SELECT-only roles. Read the
  // catalog instead; never require write privileges for the compatibility probe.
  // https://www.postgresql.org/docs/17/infoschema-table-constraints.html
  // https://www.postgresql.org/docs/17/catalog-pg-constraint.html
  // Parallel unnest preserves source/target pairing for composite foreign keys:
  // https://www.postgresql.org/docs/17/functions-array.html
  const relationships = await sql<SchemaRelationship[]>`
    SELECT
      source_table.relname AS table_name,
      source_column.attname AS column_name,
      target_table.relname AS foreign_table_name,
      target_column.attname AS foreign_column_name
    FROM pg_catalog.pg_constraint constraint_info
    JOIN pg_catalog.pg_class source_table ON source_table.oid = constraint_info.conrelid
    JOIN pg_catalog.pg_namespace source_schema ON source_schema.oid = source_table.relnamespace
    JOIN pg_catalog.pg_class target_table ON target_table.oid = constraint_info.confrelid
    JOIN pg_catalog.pg_namespace target_schema ON target_schema.oid = target_table.relnamespace
    CROSS JOIN LATERAL unnest(constraint_info.conkey, constraint_info.confkey)
      AS column_pair(source_number, target_number)
    JOIN pg_catalog.pg_attribute source_column
      ON source_column.attrelid = source_table.oid AND source_column.attnum = column_pair.source_number
    JOIN pg_catalog.pg_attribute target_column
      ON target_column.attrelid = target_table.oid AND target_column.attnum = column_pair.target_number
    WHERE source_schema.nspname = 'public'
      AND target_schema.nspname = 'public'
      AND constraint_info.contype = 'f'
  `;

  assertTeslamateSchemaCompatibility(columns, relationships);
}
