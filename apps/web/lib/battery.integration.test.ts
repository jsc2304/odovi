import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { chargeSessions, createDbConnection, vehicles, type Db } from "@odovi/db";

vi.mock("server-only", () => ({}));
vi.mock("./config", () => ({ APP_TIMEZONE: "Europe/Berlin" }));
const state = vi.hoisted(() => ({ db: null as Db | null }));
vi.mock("./db", () => ({ get db() { return state.db; } }));
const databaseUrl = process.env.ODOVI_BATTERY_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)("battery archive query", () => {
  const source = `battery-test-${randomUUID()}`;
  let connection: ReturnType<typeof createDbConnection>;
  let getBatteryRangeTrend: typeof import("./battery").getBatteryRangeTrend;
  let vehicleId: number;
  let emptyId: number;
  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/odovi_battery_test") throw new Error("Use the disposable local odovi_battery_test database only.");
    connection = createDbConnection(databaseUrl!);
    state.db = connection.db;
    ({ getBatteryRangeTrend } = await import("./battery"));
    const cars = await connection.db.insert(vehicles).values([
      { displayName: "Battery fixture", source, sourceId: "car" },
      { displayName: "Other vehicle", source, sourceId: "other" },
      { displayName: "Empty vehicle", source, sourceId: "empty" },
    ]).returning();
    vehicleId = cars[0]!.id;
    emptyId = cars[2]!.id;
    const rows = [
      // Completion crosses the app timezone's month boundary.
      { vehicleId, start: "2025-03-31T21:00Z", end: "2025-03-31T22:30Z", endRatedRangeKm: 400 },
      { vehicleId, start: "2025-04-02T12:00Z", end: "2025-04-02T13:00Z", endRatedRangeKm: null },
      { vehicleId: cars[1]!.id, start: "2020-01-01T12:00Z", end: "2020-01-01T13:00Z", endRatedRangeKm: 999 },
      { vehicleId, start: "2025-04-03T12:00Z", end: null, endRatedRangeKm: 999 },
      { vehicleId, start: "2025-04-03T12:00Z", end: "2025-04-03T11:00Z", endRatedRangeKm: 999 },
      { vehicleId, start: "2025-04-03T12:00Z", end: "9999-01-01T00:00Z", endRatedRangeKm: 999 },
    ];
    await connection.db.insert(chargeSessions).values(rows.map(({ start, end, ...row }, index) => ({
      ...row, source, sourceId: `charge-${index}`, startTime: new Date(start),
      endTime: end == null ? null : new Date(end), endSoc: 80, energyAddedKwh: 20,
    })));
  });
  afterAll(async () => {
    if (!connection) return;
    await connection.db.delete(chargeSessions).where(eq(chargeSessions.source, source));
    await connection.db.delete(vehicles).where(eq(vehicles.source, source));
    await connection.close();
  });
  it("isolates the vehicle and excludes open, future and broken spans", async () => {
    const trend = await getBatteryRangeTrend(vehicleId);
    expect(trend.months).toEqual([{ month: "2025-04", medianFullRangeKm: 500, sampleCount: 1 }]);
    expect(trend.completedChargeCount).toBe(2);
    expect(trend.observationCount).toBe(1);
    expect(trend.rejectedCount).toBe(1);
    expect(trend.firstDataAt).toBe(Date.parse("2025-03-31T22:30Z"));
  });
  it("returns no fabricated history for an empty vehicle", async () => {
    const trend = await getBatteryRangeTrend(emptyId);
    expect(trend.months).toEqual([]);
    expect(trend.firstDataAt).toBeNull();
    expect(trend.changeKm).toBeNull();
  });
});
