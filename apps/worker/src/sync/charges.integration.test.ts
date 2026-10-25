import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { chargeSessions, createDbConnection, places, vehicles } from "@odovi/db";
import type { TeslamateSql } from "../teslamate/client.js";
import type { TmChargingProcess } from "../teslamate/queries.js";

const mocks = vi.hoisted(() => ({ completed: vi.fn(), inProgress: vi.fn(), watermark: vi.fn(), record: vi.fn() }));
vi.mock("../teslamate/queries.js", () => ({
  fetchCompletedChargingProcessesSince: mocks.completed,
  fetchInProgressChargingProcesses: mocks.inProgress,
}));
vi.mock("./state.js", () => ({ getWatermark: mocks.watermark, recordSyncRun: mocks.record }));
import { syncCharges } from "./charges.js";

const databaseUrl = process.env.ODOVI_BATTERY_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("charge range history enrichment", () => {
  const source = `battery-sync-test-${randomUUID()}`;
  let connection: ReturnType<typeof createDbConnection>;
  let vehicleId: number;
  let placeId: number;
  let chargeId: number;
  const tmId = Date.now();
  const charge: TmChargingProcess = {
    id: tmId, car_id: 42, start_time: new Date("2020-01-01T12:00:00Z"),
    end_time: new Date("2020-01-01T13:00:00Z"), charge_energy_added: 20,
    charge_energy_used: 22, start_battery_level: 40, end_battery_level: 80,
    end_rated_range_km: 400, duration_min: 60, cost: 8, lat: 47, lon: 8,
    address: "Synthetic charger", max_power_kw: 22, avg_power_kw: 20,
    is_dc: false, outside_temp_avg: 10,
  };
  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/odovi_battery_test") throw new Error("Use the disposable local odovi_battery_test database only.");
    connection = createDbConnection(databaseUrl!);
    const [vehicle] = await connection.db.insert(vehicles).values({ displayName: "Battery sync fixture", source, sourceId: "car" }).returning();
    vehicleId = vehicle!.id;
    const [place] = await connection.db.insert(places).values({ name: "Locked fixture", lat: 48, lon: 9, source, sourceId: "place" }).returning();
    placeId = place!.id;
    mocks.watermark.mockResolvedValue(null);
    mocks.inProgress.mockResolvedValue([]);
    mocks.completed.mockResolvedValue([charge]);
  });
  afterAll(async () => {
    if (!connection) return;
    if (chargeId) await connection.db.delete(chargeSessions).where(eq(chargeSessions.id, chargeId));
    await connection.db.delete(places).where(eq(places.source, source));
    await connection.db.delete(vehicles).where(eq(vehicles.source, source));
    await connection.close();
  });
  it("inserts independent range and enriches historical upserts without overwriting user annotations", async () => {
    const run = () => syncCharges(connection.db, {} as TeslamateSql,
      new Map([[42, { id: vehicleId, efficiencyKwhPerKm: 0.16 }]]), []);
    const first = await run();
    chargeId = first.upsertedRefs[0]!.odoviChargeSessionId;
    const read = async () => (await connection.db.select().from(chargeSessions).where(eq(chargeSessions.id, chargeId)))[0]!;
    expect(await read()).toMatchObject({ endRatedRangeKm: 400, endSoc: 80, cost: "8.00", costSource: "synced" });
    await connection.db.update(chargeSessions).set({
      endRatedRangeKm: null, cost: "19.50", currency: "EUR", costSource: "manual",
      notes: "Keep my annotation", placeLocked: true, placeId,
    }).where(eq(chargeSessions.id, chargeId));
    mocks.completed.mockResolvedValue([{ ...charge, end_rated_range_km: 390, cost: 99 }]);
    const second = await run();
    expect(second.upsertedRefs[0]!.odoviChargeSessionId).toBe(chargeId);
    expect(await read()).toMatchObject({ endRatedRangeKm: 390, cost: "19.50", currency: "EUR",
      costSource: "manual", notes: "Keep my annotation", placeLocked: true, placeId });
    expect(mocks.completed).toHaveBeenLastCalledWith(expect.anything(), new Date(-86400000));
    const rows = await connection.db.select().from(chargeSessions).where(inArray(chargeSessions.id, [chargeId]));
    expect(rows).toHaveLength(1);
  });
});
