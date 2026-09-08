import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, asc, eq, inArray } from "drizzle-orm";
import { auditLog, createDbConnection, drives, vehicles, type Db } from "@odovi/db";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
const state = vi.hoisted(() => ({ db: null as Db | null, authenticated: true }));
vi.mock("../db", () => ({ get db() { return state.db; } }));
vi.mock("../auth/session", () => ({ validateSession: async () => state.authenticated ? { id: 1, username: "classification-test" } : null }));

const databaseUrl = process.env.ODOVI_CLASSIFICATION_TEST_DATABASE_URL;

// Never pick up DATABASE_URL; this test writes only to a named disposable database.
describe.skipIf(!databaseUrl)("classification persistence and undo", () => {
  const source = `classification-test-${randomUUID()}`;
  let connection: ReturnType<typeof createDbConnection>;
  let setClassification: typeof import("./drives").setDriveClassification;
  let undo: typeof import("./drives").undoDriveClassification;
  let vehicleId: number;
  let driveId: number;
  const ownedIds: number[] = [];

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || !["/odovi_classification_test", "/odovi_paper_ink_test"].includes(url.pathname)) {
      throw new Error("Use a disposable local classification test database.");
    }
    connection = createDbConnection(databaseUrl!);
    state.db = connection.db;
    const actions = await import("./drives");
    setClassification = actions.setDriveClassification;
    undo = actions.undoDriveClassification;
    const [car] = await state.db.insert(vehicles).values({ displayName: "Classification test", source, sourceId: "car" }).returning();
    vehicleId = car!.id;
  });

  beforeEach(async () => {
    state.authenticated = true;
    const [drive] = await state.db!.insert(drives).values({ vehicleId, source, sourceId: randomUUID(), startTime: new Date(), endTime: new Date(), notes: "Preserve this note" }).returning();
    driveId = drive!.id;
    ownedIds.push(driveId);
  });

  afterAll(async () => {
    if (!connection) return;
    if (ownedIds.length) await connection.db.delete(auditLog).where(and(eq(auditLog.entityType, "drive"), inArray(auditLog.entityId, ownedIds)));
    await connection.db.delete(drives).where(eq(drives.source, source));
    await connection.db.delete(vehicles).where(eq(vehicles.source, source));
    await connection.close();
  });

  const current = async () => (await state.db!.select().from(drives).where(eq(drives.id, driveId)))[0]!;
  const history = () => state.db!.select().from(auditLog).where(and(eq(auditLog.entityType, "drive"), eq(auditLog.entityId, driveId), eq(auditLog.field, "classification"))).orderBy(asc(auditLog.id));

  it("saves and undoes with an audit trail while preserving notes", async () => {
    const change = await setClassification(driveId, "business");
    expect(change?.previous).toBe("unclassified");
    expect((await current()).classification).toBe("business");
    await undo(change!.auditId);
    expect(await current()).toMatchObject({ classification: "unclassified", notes: "Preserve this note" });
    expect((await history()).map(row => [row.oldValue, row.newValue])).toEqual([["unclassified", "business"], ["business", "unclassified"]]);
  });

  it("does not let an older undo overwrite a newer classification", async () => {
    const first = await setClassification(driveId, "private");
    const second = await setClassification(driveId, "business");
    await expect(undo(first!.auditId)).rejects.toThrow("overview.undoUnavailable");
    expect((await current()).classification).toBe("business");
    await undo(second!.auditId);
    expect((await current()).classification).toBe("private");
    await expect(undo(first!.auditId)).rejects.toThrow("overview.undoUnavailable");
  });

  it("rejects a repeated undo", async () => {
    const change = await setClassification(driveId, "commute");
    await undo(change!.auditId);
    await expect(undo(change!.auditId)).rejects.toThrow("overview.undoUnavailable");
    expect((await history()).length).toBe(2);
  });

  it("serializes overlapping changes into a consistent audit chain", async () => {
    await Promise.all([setClassification(driveId, "private"), setClassification(driveId, "business")]);
    const entries = await history();
    expect(entries).toHaveLength(2);
    expect(entries[0]!.oldValue).toBe("unclassified");
    expect(entries[1]!.oldValue).toBe(entries[0]!.newValue);
    expect((await current()).classification).toBe(entries[1]!.newValue);
  });

  it("treats unchanged classifications as no-ops", async () => {
    expect(await setClassification(driveId, "unclassified")).toBeNull();
    expect(await history()).toHaveLength(0);
  });

  it("saves detail annotations atomically and only restores classification on undo", async () => {
    const { updateDriveAnnotations } = await import("./drives");
    const form = new FormData();
    form.set("driveId", String(driveId));
    form.set("classification", "business");
    form.set("notes", "Explicitly saved note");
    form.set("purpose", "Customer visit");
    expect(await updateDriveAnnotations({ ok: false }, form)).toEqual({ ok: true });
    expect(await current()).toMatchObject({ classification: "business", notes: "Explicitly saved note", purpose: "Customer visit" });
    const entries = await history();
    await undo(entries[0]!.id);
    expect(await current()).toMatchObject({ classification: "unclassified", notes: "Explicitly saved note", purpose: "Customer visit" });
  });

  it("keeps the audit chain consistent when bulk and individual edits overlap", async () => {
    const { bulkUpdateDrives } = await import("./drives");
    await Promise.all([
      bulkUpdateDrives({ driveIds: [driveId], classification: "business", purpose: "Bulk purpose" }),
      setClassification(driveId, "private"),
    ]);
    const entries = await history();
    expect(entries).toHaveLength(2);
    expect(entries[0]!.oldValue).toBe("unclassified");
    expect(entries[1]!.oldValue).toBe(entries[0]!.newValue);
    expect(await current()).toMatchObject({ classification: entries[1]!.newValue, purpose: "Bulk purpose", notes: "Preserve this note" });
  });

  it("requires authentication for both save and undo", async () => {
    const change = await setClassification(driveId, "private");
    state.authenticated = false;
    await expect(setClassification(driveId, "business")).rejects.toThrow("errors.notAuthenticated");
    await expect(undo(change!.auditId)).rejects.toThrow("errors.notAuthenticated");
    expect((await current()).classification).toBe("private");
  });

  it("reports a complete daily duration and keeps incomplete duration unknown", async () => {
    const { getTodayStats } = await import("../dashboard");
    const [car] = await state.db!.insert(vehicles).values({ displayName: "Daily totals", source, sourceId: "totals" }).returning();
    const base = { vehicleId: car!.id, source, startTime: new Date(), endTime: new Date() };
    const rows = await state.db!.insert(drives).values([
      { ...base, sourceId: "duration-1", distanceKm: 12, durationSeconds: 600 },
      { ...base, sourceId: "duration-2", distanceKm: 8, durationSeconds: 300 },
    ]).returning();
    ownedIds.push(...rows.map(row => row.id));
    expect(await getTodayStats(car!.id)).toMatchObject({ driveCount: 2, distanceKm: 20, durationSeconds: 900 });
    await state.db!.update(drives).set({ durationSeconds: null }).where(eq(drives.id, rows[0]!.id));
    expect((await getTodayStats(car!.id)).durationSeconds).toBeNull();
  });

  it("rejects missing drives and invalid undo handles without changing data", async () => {
    await expect(setClassification(-1, "private")).rejects.toThrow();
    await expect(setClassification(9007199254740990, "private")).rejects.toThrow("errors.driveNotFound");
    await expect(undo(-1)).rejects.toThrow();
    await expect(undo(9007199254740990)).rejects.toThrow("overview.undoUnavailable");
    expect((await current()).classification).toBe("unclassified");
  });
});
