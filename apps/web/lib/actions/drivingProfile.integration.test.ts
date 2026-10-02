import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { auditLog, createDbConnection, drives, settings, sessions, users, vehicles, type Db } from "@odovi/db";
import { drivingProfileKey, parseDrivingProfile } from "@odovi/core";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
const state = vi.hoisted(() => ({ db: null as Db | null, user: "profile-test-user" as string | null, userId: 0, sessionId: "" }));
vi.mock("../db", () => ({ get db() { return state.db; } }));
vi.mock("../auth/session", () => ({ validateSession: async () => state.user ? { id: state.userId, username: state.user, sessionId: state.sessionId } : null }));

const databaseUrl = process.env.ODOVI_CLASSIFICATION_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)("driving profile actions", () => {
  const source = `profile-actions-${randomUUID()}`;
  let connection: ReturnType<typeof createDbConnection>;
  let actions: typeof import("./drivingProfile");
  let setClassification: typeof import("./drives").setDriveClassification;
  let vehicleId: number;
  let otherVehicleId: number;

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || !["/odovi_classification_test", "/odovi_paper_ink_test"].includes(url.pathname)) throw new Error("Use a disposable local classification test database.");
    connection = createDbConnection(databaseUrl!);
    state.db = connection.db;
    const [account] = await connection.db.insert(users).values({ username: source, passwordHash: "synthetic" }).returning();
    state.userId = account!.id; state.sessionId = randomUUID();
    await connection.db.insert(sessions).values({ id: state.sessionId, userId: state.userId, expiresAt: new Date(Date.now() + 86400000) });
    actions = await import("./drivingProfile");
    setClassification = (await import("./drives")).setDriveClassification;
  });
  beforeEach(async () => {
    state.user = "profile-test-user";
    const cars = await connection.db.insert(vehicles).values([
      { displayName: "Profile actions", source, sourceId: "car" },
      { displayName: "Other car", source, sourceId: "other" },
    ]).returning();
    vehicleId = cars[0]!.id;
    otherVehicleId = cars[1]!.id;
  });
  afterEach(async () => {
    const ids = [vehicleId, otherVehicleId];
    const rows = await connection.db.select({ id: drives.id }).from(drives).where(inArray(drives.vehicleId, ids));
    if (rows.length) await connection.db.delete(auditLog).where(and(eq(auditLog.entityType, "drive"), inArray(auditLog.entityId, rows.map(d => d.id))));
    await connection.db.delete(auditLog).where(and(eq(auditLog.entityType, "vehicle"), inArray(auditLog.entityId, ids)));
    await connection.db.delete(drives).where(inArray(drives.vehicleId, ids));
    await connection.db.delete(settings).where(inArray(settings.key, ids.map(drivingProfileKey)));
    await connection.db.delete(vehicles).where(inArray(vehicles.id, ids));
  });
  afterAll(async () => { if (connection) { if (state.userId) await connection.db.delete(users).where(eq(users.id, state.userId)); await connection.close(); } });
  const drive = async (patch: Partial<typeof drives.$inferInsert> = {}) => {
    const [row] = await connection.db.insert(drives).values({ vehicleId, source, sourceId: randomUUID(),
      startTime: new Date("2020-01-01T10:00:00Z"), endTime: new Date("2020-01-01T10:30:00Z"), notes: "Keep this", ...patch }).returning();
    return row!;
  };
  const current = async (id: number) => (await connection.db.select().from(drives).where(eq(drives.id, id)))[0]!;
  const profile = async () => parseDrivingProfile((await connection.db.select().from(settings).where(eq(settings.key, drivingProfileKey(vehicleId))))[0]?.value)!;

  it("saves the one-time choice without backfilling and keeps the boundary on an unchanged save", async () => {
    const old = await drive();
    await actions.saveDrivingProfile(vehicleId, "private");
    const first = await profile();
    expect(first.usage).toBe("private");
    expect((await current(old.id)).classification).toBe("unclassified");
    await actions.saveDrivingProfile(vehicleId, "private");
    expect(await profile()).toEqual(first);
    await connection.db.update(settings).set({ value: { ...first, effectiveFrom: "2020-01-01T00:00:00Z" } }).where(eq(settings.key, drivingProfileKey(vehicleId)));
    await actions.saveDrivingProfile(vehicleId, "balanced");
    expect((await profile()).usage).toBe("balanced");
    expect(Date.parse((await profile()).effectiveFrom)).toBeGreaterThan(Date.parse("2020-01-01T00:00:00Z"));
    await expect(actions.classifyOpenDrives(vehicleId, "private")).rejects.toThrow("profileChanged");
  });

  it("explicitly includes historical open drives and preserves classified, ongoing and other-vehicle drives", async () => {
    const old = await drive();
    const imported = await drive({ source: "tessie" });
    const ongoing = await drive({ endTime: null });
    const classified = await drive({ classification: "commute" });
    const other = await drive({ vehicleId: otherVehicleId });
    await actions.saveDrivingProfile(vehicleId, "private");
    const result = await actions.classifyOpenDrives(vehicleId, "private");
    expect(result.count).toBe(2);
    expect(await current(old.id)).toMatchObject({ classification: "private", notes: "Keep this" });
    expect((await current(imported.id)).classification).toBe("private");
    expect((await current(ongoing.id)).classification).toBe("unclassified");
    expect((await current(other.id)).classification).toBe("unclassified");
    expect((await current(classified.id)).classification).toBe("commute");
    expect(await actions.classifyOpenDrives(vehicleId, "private")).toEqual({ count: 0, batchId: null });
    expect(await actions.undoOpenDrives(result.batchId!)).toEqual({ restored: 2, skipped: 0 });
    expect((await current(old.id)).classification).toBe("unclassified");
    expect((await current(imported.id)).classification).toBe("unclassified");
    await expect(actions.undoOpenDrives(result.batchId!)).rejects.toThrow("undoUnavailable");
  });

  it("undo skips later corrections, including a correction back to the same value", async () => {
    const untouched = await drive();
    const changed = await drive();
    const changedBack = await drive();
    await actions.saveDrivingProfile(vehicleId, "business");
    const result = await actions.classifyOpenDrives(vehicleId, "business");
    await setClassification(changed.id, "private");
    await setClassification(changedBack.id, "private");
    await setClassification(changedBack.id, "business");
    expect(await actions.undoOpenDrives(result.batchId!)).toEqual({ restored: 1, skipped: 2 });
    expect((await current(untouched.id)).classification).toBe("unclassified");
    expect((await current(changed.id)).classification).toBe("private");
    expect((await current(changedBack.id)).classification).toBe("business");
  });

  it("requires authentication, validates the displayed choice and restricts undo to its author", async () => {
    const row = await drive();
    await actions.saveDrivingProfile(vehicleId, "private");
    await expect(actions.classifyOpenDrives(vehicleId, "business")).rejects.toThrow("profileChanged");
    const result = await actions.classifyOpenDrives(vehicleId, "private");
    state.user = "other-user";
    await expect(actions.undoOpenDrives(result.batchId!)).rejects.toThrow("undoUnavailable");
    state.user = null;
    await expect(actions.saveDrivingProfile(vehicleId, "business")).rejects.toThrow("notAuthenticated");
    await expect(actions.classifyOpenDrives(vehicleId, "private")).rejects.toThrow("notAuthenticated");
    await expect(actions.undoOpenDrives(result.batchId!)).rejects.toThrow("notAuthenticated");
    expect((await current(row.id)).classification).toBe("private");
    state.user = "profile-test-user";
    await expect(actions.saveDrivingProfile(-1, "private")).rejects.toThrow();
    await expect(actions.saveDrivingProfile(9007199254740990, "private")).rejects.toThrow("vehicleMissing");
  });

  it("serializes repeated bulk clicks into one batch", async () => {
    await drive();
    await actions.saveDrivingProfile(vehicleId, "private");
    const results = await Promise.all([actions.classifyOpenDrives(vehicleId, "private"), actions.classifyOpenDrives(vehicleId, "private")]);
    expect(results.reduce((sum, result) => sum + result.count, 0)).toBe(1);
    expect(results.filter(result => result.batchId != null)).toHaveLength(1);
  });
});
