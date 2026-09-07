import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { chargeSessions, createDbConnection, drives, places, vehicles, type Db } from "@odovi/db";

vi.mock("server-only", () => ({}));
vi.mock("./config", () => ({ APP_TIMEZONE: "Europe/Berlin" }));
const state = vi.hoisted(() => ({ db: null as Db | null }));
vi.mock("./db", () => ({ get db() { return state.db; } }));

// Shares the existing opt-in disposable DB with the charge comparison tests.
// Never fall back to DATABASE_URL, which may contain a personal archive.
const databaseUrl = process.env.ODOVI_CHARGE_ANALYSIS_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)("yearly insights archive queries", () => {
  const source = `yearly-insights-test-${randomUUID()}`;
  let connection: ReturnType<typeof createDbConnection>;
  let getYearlyInsights: typeof import("./yearlyInsights").getYearlyInsights;
  let getInsightYears: typeof import("./yearlyInsights").getInsightYears;
  let vehicleId: number;
  let emptyVehicleId: number;
  let workId: number;

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/odovi_charge_analysis_test") {
      throw new Error("Use the disposable local odovi_charge_analysis_test database only.");
    }
    connection = createDbConnection(databaseUrl!);
    state.db = connection.db;
    ({ getYearlyInsights, getInsightYears } = await import("./yearlyInsights"));
    const db = connection.db;
    const cars = await db.insert(vehicles).values([
      { displayName: "Yearly fixture", source, sourceId: "selected" },
      { displayName: "Other vehicle", source, sourceId: "other" },
      { displayName: "Empty archive", source, sourceId: "empty" },
    ]).returning({ id: vehicles.id });
    vehicleId = cars[0]!.id;
    emptyVehicleId = cars[2]!.id;
    const sites = await db.insert(places).values([
      { name: "Fixture Home", type: "home" as const, lat: 47, lon: 8, source, sourceId: "home" },
      { name: "Fixture client", type: "customer" as const, lat: 48, lon: 9, source, sourceId: "client" },
    ]).returning({ id: places.id });
    workId = sites[1]!.id;

    const rows = [
      { start: "2024-12-31T23:00:00Z", classification: "private" as const, distanceKm: 10, endPlaceId: sites[0]!.id },
      { start: "2025-03-01T10:00:00Z", classification: "business" as const, distanceKm: 100, endPlaceId: workId },
      { start: "2025-06-01T10:00:00Z", classification: "commute" as const, distanceKm: 20, endPlaceId: null },
      // Cross-year visits follow start time, exactly like the archive day view.
      { start: "2024-12-31T22:59:00Z", classification: "private" as const, distanceKm: 999, endPlaceId: null },
      { start: "2025-12-31T23:00:00Z", classification: "private" as const, distanceKm: 999, endPlaceId: null },
    ];
    await db.insert(drives).values(rows.map((row, index) => ({
      vehicleId, source, sourceId: `drive-${index}`, classification: row.classification,
      startTime: new Date(row.start), endTime: new Date(new Date(row.start).getTime() + 600_000),
      distanceKm: row.distanceKm, durationSeconds: 600,
      consumedEnergyKwh: row.distanceKm * 0.16, energyIsEstimated: false,
      endPlaceId: row.endPlaceId, endLat: 47.1234, endLon: 8.1234,
    })));
    await db.insert(drives).values([
      { vehicleId, startTime: new Date("2025-07-01T00:00:00Z"), endTime: null },
      { vehicleId, startTime: new Date("2025-07-01T00:00:00Z"), endTime: new Date("2025-06-30T23:59:00Z") },
      { vehicleId, startTime: new Date("2025-07-01T00:00:00Z"), endTime: new Date("9999-01-01T00:00:00Z") },
      { vehicleId: cars[1]!.id, startTime: new Date("2022-07-01T00:00:00Z"), endTime: new Date("2022-07-01T00:10:00Z") },
      { vehicleId: cars[1]!.id, startTime: new Date("2025-07-01T00:00:00Z"), endTime: new Date("2025-07-01T00:10:00Z") },
    ].map((row, index) => ({ ...row, source, sourceId: `excluded-${index}`, distanceKm: 999 })));

    await db.insert(chargeSessions).values([
      { start: "2024-12-31T23:00:00Z", cost: "0.10", currency: "EUR" },
      { start: "2025-03-01T11:00:00Z", cost: "0.20", currency: "EUR" },
      { start: "2025-06-01T11:00:00Z", cost: "2.00", currency: "CHF" },
      { start: "2023-03-01T11:00:00Z", cost: "99.00", currency: "EUR" },
    ].map((row, index) => ({
      vehicleId, source, sourceId: `charge-${index}`, chargerType: "dc" as const,
      startTime: new Date(row.start), endTime: new Date(new Date(row.start).getTime() + 1_800_000),
      energyAddedKwh: 20, maxPowerKw: 150, cost: row.cost, currency: row.currency,
    })));
    await db.insert(chargeSessions).values({
      vehicleId: cars[1]!.id, source, sourceId: "other-vehicle-charge", chargerType: "dc",
      startTime: new Date("2025-05-01T00:00:00Z"), endTime: new Date("2025-05-01T00:30:00Z"),
      cost: "999.00", currency: "EUR", energyAddedKwh: 99,
    });
  });

  afterAll(async () => {
    if (!connection) return;
    const db = connection.db;
    await db.delete(drives).where(eq(drives.source, source));
    await db.delete(chargeSessions).where(eq(chargeSessions.source, source));
    await db.delete(places).where(eq(places.source, source));
    await db.delete(vehicles).where(eq(vehicles.source, source));
    await connection.close();
  });

  it("selects completed drives within local-year boundaries for one vehicle", async () => {
    const insight = await getYearlyInsights(vehicleId, 2025, "all");
    expect(insight.totals.driveCount).toBe(3);
    expect(insight.totals.totalDistanceKm).toBe(130);
    expect(insight.months[0]?.driveCount).toBe(1);
    expect(insight.months[2]?.driveCount).toBe(1);
    expect(insight.destinations.find((destination) => destination.placeId === workId))
      .toMatchObject({ name: "Fixture client", lat: 48, lon: 9, visitCount: 1 });
  });

  it("filters drives without falsely attributing charging costs to that classification", async () => {
    const insight = await getYearlyInsights(vehicleId, 2025, "business");
    expect(insight.totals.driveCount).toBe(1);
    expect(insight.totals.totalDistanceKm).toBe(100);
    expect(insight.destinations).toHaveLength(1);
    expect(insight.charging.sessionCount).toBe(3);
    expect(insight.charging.costs).toEqual(expect.arrayContaining([
      { currency: "EUR", total: "0.30", sessionCount: 2 },
      { currency: "CHF", total: "2.00", sessionCount: 1 },
    ]));
  });

  it("includes charge-only years without another vehicle's years", async () => {
    const years = await getInsightYears(vehicleId);
    expect(years).toEqual(expect.arrayContaining([2026, 2025, 2024, 2023]));
    expect(years).not.toContain(2022);
    expect(years).toEqual([...years].sort((a, b) => b - a));
  });

  it("keeps the current year selectable for an empty archive", async () => {
    const insight = await getYearlyInsights(emptyVehicleId, 2025, "all");
    expect(insight.totals.driveCount).toBe(0);
    expect(insight.destinations).toEqual([]);
    expect(insight.favoriteDestination).toBeNull();
    expect(insight.charging.sessionCount).toBe(0);
    expect(insight.charging.costs).toEqual([]);
    expect(await getInsightYears(emptyVehicleId)).toHaveLength(1);
  });
});
