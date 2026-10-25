import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { chargeSessions, drives, createDbConnection, vehicles, type Db } from "@odovi/db";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ db: null as Db | null }));
vi.mock("./db", () => ({ get db() { return state.db; } }));
const databaseUrl = process.env.ODOVI_SINCE_CHARGE_TEST_DATABASE_URL;
it("rejects invalid scope before accessing the database", async () => {
  const { getSinceChargeStats } = await import("./sinceCharge");
  for (const vehicleId of [NaN, 0, -1, 1.5, Infinity]) {
    expect(await getSinceChargeStats(vehicleId)).toEqual({ state: "no-charge" });
  }
  expect(await getSinceChargeStats(1, new Date(NaN))).toEqual({ state: "no-charge" });
});
// Only an explicitly opted-in, disposable database may hold these fixtures.
describe.skipIf(!databaseUrl)("since-charge scoped database selection", () => {
  const source = `since-charge-test-${randomUUID()}`;
  const now = new Date("2026-01-02T12:00:00Z");
  const boundary = new Date("2026-01-01T12:00:00Z");
  let connection: ReturnType<typeof createDbConnection>;
  let getSinceChargeStats: typeof import("./sinceCharge").getSinceChargeStats;
  let vehicleId: number;
  let otherVehicleId: number;
  let emptyVehicleId: number;
  let chargingVehicleId: number;
  let chargeId: number;
  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/odovi_since_charge_test") {
      throw new Error("Use the disposable local odovi_since_charge_test database only.");
    }
    connection = createDbConnection(databaseUrl!);
    state.db = connection.db;
    ({ getSinceChargeStats } = await import("./sinceCharge"));
    const cars = await connection.db.insert(vehicles).values(["selected", "other", "empty", "charging"].map((id) => ({
      displayName: `Fixture ${id}`, source, sourceId: id,
    }))).returning({ id: vehicles.id });
    [vehicleId, otherVehicleId, emptyVehicleId, chargingVehicleId] = cars.map((car) => car.id) as [number, number, number, number];
    const charges = await connection.db.insert(chargeSessions).values([
      { vehicleId, startTime: new Date("2026-01-01T10:00:00Z"), endTime: boundary },
      { vehicleId, startTime: new Date("2026-01-01T11:00:00Z"), endTime: boundary },
      { vehicleId: otherVehicleId, startTime: boundary, endTime: now },
      { vehicleId, startTime: now, endTime: new Date("2026-01-03T00:00:00Z") },
      { vehicleId, startTime: now, endTime: boundary },
      { vehicleId, startTime: new Date("2027-01-01T00:00:00Z"), endTime: null },
      { vehicleId: chargingVehicleId, startTime: new Date("2026-01-01T10:00:00Z"), endTime: boundary },
      { vehicleId: chargingVehicleId, startTime: boundary, endTime: null },
    ].map((row, index) => ({ ...row, source, sourceId: `charge-${index}` }))).returning({ id: chargeSessions.id });
    chargeId = charges[1]!.id;
    await connection.db.insert(drives).values([
      { vehicleId, startTime: boundary, endTime: new Date("2026-01-01T13:00:00Z") },
      { vehicleId: otherVehicleId, startTime: boundary, endTime: new Date("2026-01-01T13:00:00Z") },
      { vehicleId, startTime: new Date("2026-01-01T11:00:00Z"), endTime: new Date("2026-01-01T13:00:00Z") },
      { vehicleId, startTime: boundary, endTime: null },
      { vehicleId, startTime: boundary, endTime: new Date("2027-01-01T00:00:00Z") },
      { vehicleId, startTime: now, endTime: boundary },
    ].map((row, index) => ({ ...row, source, sourceId: `drive-${index}`,
      distanceKm: 10, consumedEnergyKwh: 2, durationSeconds: 3600, energyIsEstimated: true })));
  });
  afterAll(async () => {
    if (!connection) return;
    await connection.db.delete(drives).where(eq(drives.source, source));
    await connection.db.delete(chargeSessions).where(eq(chargeSessions.source, source));
    await connection.db.delete(vehicles).where(eq(vehicles.source, source));
    await connection.close();
  });
  it("chooses the completed boundary deterministically and only includes scoped whole drives", async () => {
    expect(await getSinceChargeStats(vehicleId, now)).toMatchObject({
      state: "ready", chargeId, chargeEndTime: boundary, driveCount: 1,
      distanceKm: 10, energyKwh: 2, excludedStraddlingDriveCount: 1,
    });
  });
  it("invalidates the boundary while charging", async () => {
    expect(await getSinceChargeStats(chargingVehicleId, now)).toEqual({ state: "charging" });
  });
  it("returns no-charge for empty and invalid vehicle scope", async () => {
    expect(await getSinceChargeStats(emptyVehicleId, now)).toEqual({ state: "no-charge" });
    expect(await getSinceChargeStats(NaN, now)).toEqual({ state: "no-charge" });
    expect(await getSinceChargeStats(0, now)).toEqual({ state: "no-charge" });
  });
});
