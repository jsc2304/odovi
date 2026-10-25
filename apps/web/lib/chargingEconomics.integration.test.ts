import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { chargeSessions, createDbConnection, vehicles, type Db } from "@odovi/db";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ db: null as Db | null }));
vi.mock("./db", () => ({ get db() { return state.db; } }));
const databaseUrl = process.env.ODOVI_CHARGING_ECONOMICS_TEST_DATABASE_URL;

// Opt in only to this disposable database; never inherit a personal archive URL.
describe.skipIf(!databaseUrl)("charging economics database scope", () => {
  const source = `charging-economics-test-${randomUUID()}`;
  let connection: ReturnType<typeof createDbConnection>;
  let selected: number;
  let empty: number;
  let getChargingEconomics: typeof import("./chargingEconomics").getChargingEconomics;

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/odovi_charging_economics_test") throw new Error("Use the disposable local odovi_charging_economics_test database only.");
    connection = createDbConnection(databaseUrl!);
    state.db = connection.db;
    ({ getChargingEconomics } = await import("./chargingEconomics"));
    const cars = await connection.db.insert(vehicles).values(["selected", "other", "empty"].map((id) => ({ displayName: id, source, sourceId: id }))).returning({ id: vehicles.id });
    selected = cars[0]!.id; empty = cars[2]!.id;
    const { monthBounds } = await import("./calendar");
    const { start, end } = monthBounds("2025-03");
    const startTime = new Date(start.getTime() + 1000);
    const endTime = new Date(start.getTime() + 3_600_000);
    await connection.db.insert(chargeSessions).values([
      { vehicleId: selected, startTime, endTime },
      { vehicleId: selected, startTime: new Date(start.getTime() - 1000), endTime },
      { vehicleId: selected, startTime: end, endTime: new Date(end.getTime() + 3_600_000) },
      { vehicleId: cars[1]!.id, startTime, endTime },
      { vehicleId: selected, startTime, endTime: null },
      { vehicleId: selected, startTime, endTime: new Date(startTime.getTime() - 1) },
      { vehicleId: selected, startTime, endTime: new Date("2099-01-01T00:00:00Z") },
    ].map((session, index) => ({ ...session, source, sourceId: String(index), energyAddedKwh: 8, energyUsedKwh: 10, cost: "2.00", currency: "EUR", chargerType: "ac" as const })));
  });
  afterAll(async () => {
    if (!connection) return;
    await connection.db.delete(chargeSessions).where(eq(chargeSessions.source, source));
    await connection.db.delete(vehicles).where(eq(vehicles.source, source));
    await connection.close();
  });
  it("includes only the selected vehicle's valid completed sessions inside timezone month boundaries", async () => {
    expect((await getChargingEconomics(selected, "2025-03", new Date("2025-04-02T00:00:00Z"))).total).toMatchObject({ sessionCount: 1, addedKwh: 8, drawnKwh: 10, pairedCount: 1 });
    expect((await getChargingEconomics(empty, "2025-03")).total.sessionCount).toBe(0);
  });
});
