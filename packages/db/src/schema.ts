import {
  bigint,
  boolean,
  char,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

// Konventionen:
// - Alle Zeitstempel timestamptz (UTC); Anzeige-Timezone ist App-Konfiguration.
// - Gesyncte Tabellen tragen source/source_id; UNIQUE(source, source_id) ist der
//   Idempotenz-Schlüssel für Upserts und hält das Modell quellen-agnostisch
//   ('teslamate' | 'derived', später 'fleet_telemetry').
// - User-owned Spalten (classification, purpose, customer, project, notes, cost,
//   currency, *_place_locked, Tag-Links) dürfen vom Sync NIE überschrieben werden —
//   der Upsert-Code setzt sie ausschließlich beim INSERT, nie im DO UPDATE SET.

export const driveClassification = pgEnum("drive_classification", [
  "unclassified",
  "private",
  "business",
  "commute",
]);

export const chargerType = pgEnum("charger_type", ["ac", "dc"]);

export const placeType = pgEnum("place_type", [
  "home",
  "work",
  "customer",
  "charger",
  "other",
]);

const id = () =>
  bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey();

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const vehicles = pgTable(
  "vehicles",
  {
    id: id(),
    displayName: text("display_name").notNull(),
    vin: text("vin"),
    model: text("model"),
    trimBadging: text("trim_badging"),
    efficiencyKwhPerKm: doublePrecision("efficiency_kwh_per_km"),
    // User-owned Fallback (Vision §15.3): greift nur solange TeslaMate die
    // Effizienz noch nicht aus Ladevorgängen gelernt hat. Sync fasst es nie an.
    efficiencyOverrideKwhPerKm: doublePrecision("efficiency_override_kwh_per_km"),
    source: text("source").notNull(),
    sourceId: text("source_id").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("vehicles_source_uq").on(t.source, t.sourceId)],
);

export const places = pgTable("places", {
  id: id(),
  name: text("name").notNull(),
  type: placeType("type").notNull().default("other"),
  lat: doublePrecision("lat").notNull(),
  lon: doublePrecision("lon").notNull(),
  radiusM: integer("radius_m").notNull().default(100),
  address: text("address"),
  // Strompreis am Ort (user-owned) — Basis für automatische Ladekosten:
  // Sessions ohne manuellen/synced Kostenwert bekommen energy_added_kwh * Preis.
  electricityPricePerKwh: numeric("electricity_price_per_kwh", {
    precision: 8,
    scale: 4,
  }),
  electricityPriceCurrency: char("electricity_price_currency", { length: 3 }),
  source: text("source").notNull().default("user"),
  sourceId: text("source_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const drives = pgTable(
  "drives",
  {
    id: id(),
    vehicleId: bigint("vehicle_id", { mode: "number" })
      .notNull()
      .references(() => vehicles.id),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true }), // NULL = Fahrt läuft
    startOdometerKm: doublePrecision("start_odometer_km"),
    endOdometerKm: doublePrecision("end_odometer_km"),
    distanceKm: doublePrecision("distance_km"),
    durationSeconds: integer("duration_seconds"),
    startLat: doublePrecision("start_lat"),
    startLon: doublePrecision("start_lon"),
    endLat: doublePrecision("end_lat"),
    endLon: doublePrecision("end_lon"),
    startPlaceId: bigint("start_place_id", { mode: "number" }).references(
      () => places.id,
      { onDelete: "set null" },
    ),
    endPlaceId: bigint("end_place_id", { mode: "number" }).references(
      () => places.id,
      { onDelete: "set null" },
    ),
    startPlaceLocked: boolean("start_place_locked").notNull().default(false),
    endPlaceLocked: boolean("end_place_locked").notNull().default(false),
    startAddress: text("start_address"),
    endAddress: text("end_address"),
    startSoc: smallint("start_soc"),
    endSoc: smallint("end_soc"),
    consumedEnergyKwh: doublePrecision("consumed_energy_kwh"),
    energyIsEstimated: boolean("energy_is_estimated").notNull().default(true),
    avgConsumptionWhKm: doublePrecision("avg_consumption_wh_km"),
    ascentM: integer("ascent_m"),
    descentM: integer("descent_m"),
    outsideTempAvg: doublePrecision("outside_temp_avg"),
    insideTempAvg: doublePrecision("inside_temp_avg"),
    speedMaxKmh: smallint("speed_max_kmh"),
    powerMaxKw: smallint("power_max_kw"),
    powerMinKw: smallint("power_min_kw"), // negativ = stärkste Rekuperation
    // Historisches Wetter zur Fahrtzeit (Open-Meteo Archive, Worker-Backfill —
    // eigene Quelle, darf vom TeslaMate-Upsert nicht überschrieben werden)
    weatherTempC: doublePrecision("weather_temp_c"),
    weatherPrecipitationMm: doublePrecision("weather_precipitation_mm"),
    weatherWindKmh: doublePrecision("weather_wind_kmh"),
    weatherCode: smallint("weather_code"),
    weatherSyncedAt: timestamp("weather_synced_at", { withTimezone: true }),
    classification: driveClassification("classification")
      .notNull()
      .default("unclassified"),
    // Provenance: gesetzt, wenn eine Auto-Regel klassifiziert hat (Vision §5.6
    // Nachvollziehbarkeit). Regeln fassen nur unclassified-Drives ohne diesen
    // Marker an; manuelle Änderungen lassen ihn als Historie stehen.
    classifiedByRuleId: bigint("classified_by_rule_id", {
      mode: "number",
    }).references(() => classificationRules.id, { onDelete: "set null" }),
    purpose: text("purpose"),
    customer: text("customer"),
    project: text("project"),
    notes: text("notes"),
    source: text("source").notNull(),
    sourceId: text("source_id").notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("drives_source_uq").on(t.source, t.sourceId),
    index("drives_vehicle_start_idx").on(t.vehicleId, t.startTime),
    index("drives_classification_start_idx").on(t.classification, t.startTime),
    index("drives_start_place_idx").on(t.startPlaceId),
    index("drives_end_place_idx").on(t.endPlaceId),
  ],
);

export const parkSessions = pgTable(
  "park_sessions",
  {
    id: id(),
    vehicleId: bigint("vehicle_id", { mode: "number" })
      .notNull()
      .references(() => vehicles.id),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true }), // NULL = parkt gerade
    lat: doublePrecision("lat"),
    lon: doublePrecision("lon"),
    placeId: bigint("place_id", { mode: "number" }).references(
      () => places.id,
      { onDelete: "set null" },
    ),
    placeLocked: boolean("place_locked").notNull().default(false),
    address: text("address"),
    durationSeconds: integer("duration_seconds"),
    source: text("source").notNull(),
    sourceId: text("source_id").notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("park_sessions_source_uq").on(t.source, t.sourceId),
    index("park_sessions_vehicle_start_idx").on(t.vehicleId, t.startTime),
  ],
);

export const chargeSessions = pgTable(
  "charge_sessions",
  {
    id: id(),
    vehicleId: bigint("vehicle_id", { mode: "number" })
      .notNull()
      .references(() => vehicles.id),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true }),
    lat: doublePrecision("lat"),
    lon: doublePrecision("lon"),
    placeId: bigint("place_id", { mode: "number" }).references(
      () => places.id,
      { onDelete: "set null" },
    ),
    placeLocked: boolean("place_locked").notNull().default(false),
    address: text("address"),
    startSoc: smallint("start_soc"),
    endSoc: smallint("end_soc"),
    energyAddedKwh: doublePrecision("energy_added_kwh"),
    energyUsedKwh: doublePrecision("energy_used_kwh"),
    maxPowerKw: doublePrecision("max_power_kw"),
    avgPowerKw: doublePrecision("avg_power_kw"),
    chargerType: chargerType("charger_type"),
    outsideTempAvg: doublePrecision("outside_temp_avg"),
    durationSeconds: integer("duration_seconds"),
    cost: numeric("cost", { precision: 10, scale: 2 }),
    currency: char("currency", { length: 3 }),
    // Herkunft des Kostenwerts: 'synced' (TeslaMate/Import beim Insert),
    // 'manual' (User-Eingabe), 'auto' (aus places.electricity_price_per_kwh).
    // Nur 'auto'-Werte dürfen bei Preisänderungen neu berechnet werden.
    costSource: text("cost_source"),
    notes: text("notes"),
    source: text("source").notNull(),
    sourceId: text("source_id").notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("charge_sessions_source_uq").on(t.source, t.sourceId),
    index("charge_sessions_vehicle_start_idx").on(t.vehicleId, t.startTime),
  ],
);

export const routePoints = pgTable(
  "route_points",
  {
    id: id(),
    driveId: bigint("drive_id", { mode: "number" })
      .notNull()
      .references(() => drives.id, { onDelete: "cascade" }),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    elevationM: doublePrecision("elevation_m"),
    speedKmh: doublePrecision("speed_kmh"),
    odometerKm: doublePrecision("odometer_km"),
    soc: smallint("soc"),
    createdAt: createdAt(),
  },
  (t) => [index("route_points_drive_ts_idx").on(t.driveId, t.ts)],
);

export const tags = pgTable("tags", {
  id: id(),
  name: text("name").notNull().unique(),
  color: text("color"),
  category: text("category"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// Auto-Klassifizierungs-Regeln (Vision §13): Bedingungen sind AND-verknüpft,
// null = beliebig; mindestens eine Bedingung muss gesetzt sein (erzwingt die
// Action/UI). Anwendung: erste passende Regel nach priority ASC, id ASC gewinnt;
// nur Drives mit classification='unclassified' und classified_by_rule_id IS NULL.
export const classificationRules = pgTable("classification_rules", {
  id: id(),
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  priority: integer("priority").notNull().default(0),
  // Bedingungen
  startPlaceId: bigint("start_place_id", { mode: "number" }).references(
    () => places.id,
    { onDelete: "cascade" },
  ),
  endPlaceId: bigint("end_place_id", { mode: "number" }).references(
    () => places.id,
    { onDelete: "cascade" },
  ),
  weekdays: smallint("weekdays").array(), // ISO 1=Mo … 7=So, null = alle Tage
  // Aktionen (null = Feld nicht setzen)
  classification: driveClassification("classification"),
  tagId: bigint("tag_id", { mode: "number" }).references(() => tags.id, {
    onDelete: "cascade",
  }),
  purpose: text("purpose"),
  customer: text("customer"),
  project: text("project"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const driveTags = pgTable(
  "drive_tags",
  {
    driveId: bigint("drive_id", { mode: "number" })
      .notNull()
      .references(() => drives.id, { onDelete: "cascade" }),
    tagId: bigint("tag_id", { mode: "number" })
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.driveId, t.tagId] })],
);

export const chargeSessionTags = pgTable(
  "charge_session_tags",
  {
    chargeSessionId: bigint("charge_session_id", { mode: "number" })
      .notNull()
      .references(() => chargeSessions.id, { onDelete: "cascade" }),
    tagId: bigint("tag_id", { mode: "number" })
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.chargeSessionId, t.tagId] })],
);

// Aktueller Fahrzeugzustand für die Startseite — eine Zeile pro Fahrzeug,
// vom Worker bei jedem Zyklus aus TeslaMates letzter Position/State überschrieben.
export const vehicleStatus = pgTable("vehicle_status", {
  vehicleId: bigint("vehicle_id", { mode: "number" })
    .primaryKey()
    .references(() => vehicles.id, { onDelete: "cascade" }),
  ts: timestamp("ts", { withTimezone: true }),
  lat: doublePrecision("lat"),
  lon: doublePrecision("lon"),
  soc: smallint("soc"),
  ratedRangeKm: doublePrecision("rated_range_km"),
  odometerKm: doublePrecision("odometer_km"),
  state: text("state"), // TeslaMate states.state: driving | charging | online | asleep | offline | ...
  stateSince: timestamp("state_since", { withTimezone: true }),
  tpmsFlBar: doublePrecision("tpms_fl_bar"),
  tpmsFrBar: doublePrecision("tpms_fr_bar"),
  tpmsRlBar: doublePrecision("tpms_rl_bar"),
  tpmsRrBar: doublePrecision("tpms_rr_bar"),
  syncedAt: timestamp("synced_at", { withTimezone: true }),
});

// Ladekurve: downsampled Leistungsverlauf je Ladevorgang aus TeslaMate `charges`.
// Idempotent per delete+reinsert je Session (wie route_points je Drive).
export const chargePoints = pgTable(
  "charge_points",
  {
    id: id(),
    chargeSessionId: bigint("charge_session_id", { mode: "number" })
      .notNull()
      .references(() => chargeSessions.id, { onDelete: "cascade" }),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    powerKw: doublePrecision("power_kw"),
    soc: smallint("soc"),
    outsideTemp: doublePrecision("outside_temp"),
  },
  (t) => [index("charge_points_session_ts_idx").on(t.chargeSessionId, t.ts)],
);

// Software-Update-Historie aus TeslaMate `updates`.
export const softwareUpdates = pgTable(
  "software_updates",
  {
    id: id(),
    vehicleId: bigint("vehicle_id", { mode: "number" })
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    version: text("version"),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true }),
    source: text("source").notNull(),
    sourceId: text("source_id").notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
  },
  (t) => [
    unique("software_updates_source_uq").on(t.source, t.sourceId),
    index("software_updates_vehicle_idx").on(t.vehicleId, t.startTime),
  ],
);

export const journeyType = pgEnum("journey_type", [
  "vacation",
  "business_trip",
  "roadtrip",
  "other",
]);

export const journeys = pgTable(
  "journeys",
  {
    id: id(),
    name: text("name").notNull(),
    type: journeyType("type").notNull().default("other"),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true }).notNull(),
    color: text("color"),
    description: text("description"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("journeys_start_idx").on(t.startTime)],
);

// Immutable planned roadtrip snapshots linked to the existing Journey
// container. Editing a plan inserts the next version instead of overwriting
// the assumptions that were visible before departure.
export const journeyPlans = pgTable(
  "journey_plans",
  {
    id: id(),
    journeyId: bigint("journey_id", { mode: "number" })
      .notNull()
      .references(() => journeys.id, { onDelete: "cascade" }),
    vehicleId: bigint("vehicle_id", { mode: "number" })
      .notNull()
      .references(() => vehicles.id),
    version: integer("version").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    snapshot: jsonb("snapshot").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("journey_plans_version_uq").on(t.journeyId, t.version),
    index("journey_plans_journey_idx").on(t.journeyId, t.version),
  ],
);

// Mitgliedschaft ist explizit (Zeitraum-Auto-Zuordnung legt Rows an, manuelle
// Korrekturen ändern sie): assignedBy unterscheidet auto/manual; excluded=true
// heißt "vom Nutzer entfernt, Auto-Zuordnung darf nicht erneut hinzufügen".
export const journeyItems = pgTable(
  "journey_items",
  {
    id: id(),
    journeyId: bigint("journey_id", { mode: "number" })
      .notNull()
      .references(() => journeys.id, { onDelete: "cascade" }),
    itemType: text("item_type").notNull(), // 'drive' | 'charge' | 'park'
    itemId: bigint("item_id", { mode: "number" }).notNull(),
    sortOrder: integer("sort_order"),
    assignedBy: text("assigned_by").notNull().default("auto"), // 'auto' | 'manual'
    excluded: boolean("excluded").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("journey_items_uq").on(t.journeyId, t.itemType, t.itemId),
    index("journey_items_journey_idx").on(t.journeyId),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    entityType: text("entity_type").notNull(),
    entityId: bigint("entity_id", { mode: "number" }).notNull(),
    field: text("field").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    changedBy: text("changed_by").notNull(),
  },
  (t) => [index("audit_log_entity_idx").on(t.entityType, t.entityId)],
);

export const syncState = pgTable(
  "sync_state",
  {
    source: text("source").notNull(),
    entity: text("entity").notNull(),
    watermarkTs: timestamp("watermark_ts", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastStatus: text("last_status"),
    lastError: text("last_error"),
    rowsUpserted: integer("rows_upserted"),
  },
  (t) => [primaryKey({ columns: [t.source, t.entity] })],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: updatedAt(),
});

export const users = pgTable("users", {
  id: id(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    // sha256-Hex des Session-Tokens — das Klartext-Token existiert nur im Cookie
    id: text("id").primaryKey(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);
