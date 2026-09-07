import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { chargePoints, chargeSessions, createDbConnection, places, vehicles, type Db } from "@odovi/db";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ db: null as Db | null }));
vi.mock("./db", () => ({ get db() { return state.db; } }));

const databaseUrl = process.env.ODOVI_CHARGE_ANALYSIS_TEST_DATABASE_URL;

// Opt-in against a migrated, disposable local database. Never use DATABASE_URL:
// a developer may have that variable pointing at their personal archive.
describe.skipIf(!databaseUrl)("DC analysis database selection", () => {
  const source = `charge-analysis-test-${randomUUID()}`;
  let connection: ReturnType<typeof createDbConnection>;
  let getChargeAnalysis: typeof import("./chargeAnalysis").getChargeAnalysis;
  let vehicleId: number;
  let emptyVehicleId: number;
  let placeId: number;
  let selectedIds: number[] = [];

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/odovi_charge_analysis_test") {
      throw new Error("Use the disposable local odovi_charge_analysis_test database only.");
    }
    connection = createDbConnection(databaseUrl!);
    state.db = connection.db;
    ({ getChargeAnalysis } = await import("./chargeAnalysis"));
    const db = connection.db;
    const cars = await db.insert(vehicles).values([
      { displayName: "Analysis fixture", source, sourceId: "selected" },
      { displayName: "Other vehicle", source, sourceId: "other" },
      { displayName: "No DC sessions", source, sourceId: "empty" },
    ]).returning({ id: vehicles.id });
    vehicleId = cars[0]!.id;
    emptyVehicleId = cars[2]!.id;
    const [place] = await db.insert(places).values({
      name: "Fixture charging stop", lat: 47, lon: 8, source, sourceId: "place",
    }).returning({ id: places.id });
    placeId = place!.id;

    // Two equal start timestamps also exercise the deterministic ID tie-break.
    const starts = Array.from({ length: 12 }, (_, index) =>
      new Date(Date.UTC(2025, 0, Math.min(index + 1, 11), 12)));
    const selected = await db.insert(chargeSessions).values(starts.map((startTime, index) => ({
      vehicleId, source, sourceId: `dc-${index}`, chargerType: "dc" as const,
      startTime, endTime: new Date(startTime.getTime() + 40 * 60_000),
      maxPowerKw: 100 + index, outsideTempAvg: 15, placeId,
      address: "Synthetic location",
    }))).returning({ id: chargeSessions.id, startTime: chargeSessions.startTime });
    selectedIds = selected.map((session) => session.id).reverse();

    // Newer rows must never enter this comparison, even with high peak values.
    const recent = new Date(Date.UTC(2025, 1, 1, 12));
    const ended = new Date(recent.getTime() + 40 * 60_000);
    const excluded = await db.insert(chargeSessions).values([
      { vehicleId: cars[1]!.id, chargerType: "dc" as const, endTime: ended },
      { vehicleId, chargerType: "ac" as const, endTime: ended },
      { vehicleId, chargerType: null, endTime: ended },
      { vehicleId, chargerType: "dc" as const, endTime: null },
      { vehicleId, chargerType: "dc" as const, endTime: new Date(recent.getTime() - 1) },
      { vehicleId, chargerType: "dc" as const, endTime: new Date("9999-01-01T00:00:00Z") },
    ].map((row, index) => ({
      ...row, startTime: recent, source, sourceId: `excluded-${index}`, maxPowerKw: 999,
    }))).returning({ id: chargeSessions.id });

    // Leave the newest selected session without points: it must remain selected
    // with explicit missing data, rather than silently substituting an older one.
    await db.insert(chargePoints).values(selected.slice(0, -1).flatMap((session) =>
      Array.from({ length: 36 }, (_, index) => ({
        chargeSessionId: session.id,
        ts: new Date(session.startTime.getTime() + index * 60_000),
        soc: 10 + index * 2,
        powerKw: 90 - index,
        outsideTemp: 15,
      })),
    ));
    await db.insert(chargePoints).values(excluded.map((session) => ({
      chargeSessionId: session.id, ts: recent, soc: 10, powerKw: 999, outsideTemp: 15,
    })));
  });

  afterAll(async () => {
    if (!connection) return;
    const db = connection.db;
    const ownedSessions = await db.select({ id: chargeSessions.id })
      .from(chargeSessions).where(eq(chargeSessions.source, source));
    if (ownedSessions.length) {
      await db.delete(chargePoints).where(inArray(chargePoints.chargeSessionId, ownedSessions.map((row) => row.id)));
    }
    await db.delete(chargeSessions).where(eq(chargeSessions.source, source));
    await db.delete(places).where(eq(places.source, source));
    await db.delete(vehicles).where(eq(vehicles.source, source));
    await connection.close();
  });

  it("selects exactly the latest five completed DC sessions for one vehicle", async () => {
    const analysis = await getChargeAnalysis(vehicleId, 5);
    expect(analysis.sessions.map((session) => session.id)).toEqual(selectedIds.slice(0, 5));
    expect(analysis.summary.sessionCount).toBe(5);
    expect(analysis.summary.peakPowerKw).toBe(111);
    expect(analysis.sessions[1]?.placeName).toBe("Fixture charging stop");
    expect(analysis.sessions[1]?.placeId).toBe(placeId);
  });

  it("selects ten without allowing sample counts or missing samples to change the limit", async () => {
    const analysis = await getChargeAnalysis(vehicleId, 10);
    expect(analysis.sessions.map((session) => session.id)).toEqual(selectedIds.slice(0, 10));
    expect(analysis.sessions[0]?.tenToEighty.reason).toBe("missing-points");
    expect(analysis.sessions[0]?.tenToEighty.minutes).toBeNull();
    expect(analysis.summary.timingSessionCount).toBe(9);
    expect(analysis.summary.medianTenToEightyMinutes).toBe(35);
  });

  it("returns an empty analysis when the vehicle has no DC history", async () => {
    const analysis = await getChargeAnalysis(emptyVehicleId, 5);
    expect(analysis.sessions).toEqual([]);
    expect(analysis.locations).toEqual([]);
    expect(analysis.summary.medianTenToEightyMinutes).toBeNull();
    expect(analysis.summary.peakPowerKw).toBeNull();
  });
});
