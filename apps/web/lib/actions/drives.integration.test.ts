import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, asc, eq, inArray } from "drizzle-orm";
import { auditLog, classificationOperations, createDbConnection, driveTags, drives, sessions, tags, users, vehicles, type Db } from "@odovi/db";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
const state = vi.hoisted(() => ({ db: null as Db | null, authenticated: true, userId: 0, sessionId: "" }));
vi.mock("../db", () => ({ get db() { return state.db; } }));
vi.mock("../auth/session", () => ({ validateSession: async () => state.authenticated ? { id: state.userId, username: "classification-test", sessionId: state.sessionId } : null }));
const databaseUrl = process.env.ODOVI_CLASSIFICATION_TEST_DATABASE_URL;

// Never pick up DATABASE_URL; these checks write only to a named disposable DB.
describe.skipIf(!databaseUrl)("quick classification operations", () => {
  const source = `classification-test-${randomUUID()}`;
  let connection: ReturnType<typeof createDbConnection>;
  let actions: typeof import("./drives");
  let vehicleId: number;
  let driveId: number;
  let userId: number;
  let otherUserId: number;
  const sessionId = randomUUID();
  const secondSessionId = randomUUID();
  const otherSessionId = randomUUID();
  const ownedIds: number[] = [];

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || !["/odovi_classification_test", "/odovi_paper_ink_test"].includes(url.pathname)) throw new Error("Use a disposable local classification test database.");
    connection = createDbConnection(databaseUrl!);
    state.db = connection.db;
    actions = await import("./drives");
    const accounts = await connection.db.insert(users).values([{ username: source, passwordHash: "synthetic" }, { username: `${source}-other`, passwordHash: "synthetic" }]).returning();
    userId = accounts[0]!.id; otherUserId = accounts[1]!.id;
    await connection.db.insert(sessions).values([
      { id: sessionId, userId, expiresAt: new Date(Date.now() + 86400000) },
      { id: secondSessionId, userId, expiresAt: new Date(Date.now() + 86400000) },
      { id: otherSessionId, userId: otherUserId, expiresAt: new Date(Date.now() + 86400000) },
    ]);
    const [car] = await state.db.insert(vehicles).values({ displayName: "Classification test", source, sourceId: "car" }).returning();
    vehicleId = car!.id;
  });
  async function newDrive() {
    const [row] = await state.db!.insert(drives).values({ vehicleId, source, sourceId: randomUUID(), startTime: new Date(), endTime: new Date(), notes: "Preserve this note" }).returning();
    ownedIds.push(row!.id); return row!.id;
  }
  beforeEach(async () => { state.authenticated = true; state.userId = userId; state.sessionId = sessionId; driveId = await newDrive(); });
  afterAll(async () => {
    if (!connection) return;
    if (userId && otherUserId) await connection.db.delete(users).where(inArray(users.id, [userId, otherUserId]));
    if (ownedIds.length) await connection.db.delete(auditLog).where(and(eq(auditLog.entityType, "drive"), inArray(auditLog.entityId, ownedIds)));
    await connection.db.delete(drives).where(eq(drives.source, source));
    await connection.db.delete(vehicles).where(eq(vehicles.source, source));
    await connection.db.delete(tags).where(eq(tags.name, source));
    await connection.close();
  });
  const current = async (id = driveId) => (await state.db!.select().from(drives).where(eq(drives.id, id)))[0]!;
  const history = (id = driveId) => state.db!.select().from(auditLog).where(and(eq(auditLog.entityType, "drive"), eq(auditLog.entityId, id), eq(auditLog.field, "classification"))).orderBy(asc(auditLog.id));

  it("saves single classification and restores only classification with permanent audits", async () => {
    const operation = await actions.setDriveClassification(driveId, "business");
    expect(operation).toMatchObject({ count: 1, classification: "business", status: "available" });
    expect(await actions.getLatestClassificationOperation()).toEqual(operation);
    expect(await actions.undoDriveClassification(operation!.operationId)).toMatchObject({ ok: true, operation: { status: "undone" } });
    expect(await current()).toMatchObject({ classification: "unclassified", classificationRevision: 2, notes: "Preserve this note" });
    expect((await history()).map(row => [row.oldValue, row.newValue])).toEqual([["unclassified", "business"], ["business", "unclassified"]]);
  });

  it("bulk undo preserves later notes/tags and restores mixed previous classifications atomically", async () => {
    const second = await newDrive();
    await state.db!.update(drives).set({ classification: "private" }).where(eq(drives.id, second));
    const operation = await actions.bulkSetDriveClassification([driveId, second, driveId], "business");
    expect(operation!.count).toBe(2);
    await state.db!.update(drives).set({ notes: "New unrelated note" }).where(eq(drives.id, driveId));
    const tag = await actions.assignTagToDrive(driveId, source);
    expect(await actions.undoDriveClassification(operation!.operationId)).toMatchObject({ ok: true });
    expect(await current()).toMatchObject({ classification: "unclassified", notes: "New unrelated note" });
    expect((await current(second)).classification).toBe("private");
    expect(await state.db!.select().from(driveTags).where(and(eq(driveTags.driveId, driveId), eq(driveTags.tagId, tag.id)))).toHaveLength(1);
  });

  it("supersedes previous quick operations, including operations on another drive", async () => {
    const first = await actions.setDriveClassification(driveId, "private");
    const second = await actions.setDriveClassification(await newDrive(), "commute");
    const before = await current();
    expect(await actions.undoDriveClassification(first!.operationId)).toEqual({ ok: false, error: "undo.superseded" });
    expect(await current()).toEqual(before);
    expect(await actions.getLatestClassificationOperation()).toEqual(second);
  });

  it("detects away-and-back even from a writer without an audit entry and rejects the whole bulk", async () => {
    const second = await newDrive();
    const operation = await actions.bulkSetDriveClassification([driveId, second], "business");
    await state.db!.update(drives).set({ classification: "private" }).where(eq(drives.id, second));
    await state.db!.update(drives).set({ classification: "business" }).where(eq(drives.id, second));
    const before = [await current(), await current(second)];
    const audits = [await history(), await history(second)];
    expect(await actions.undoDriveClassification(operation!.operationId)).toEqual({ ok: false, error: "undo.conflict" });
    expect([await current(), await current(second)]).toEqual(before);
    expect([await history(), await history(second)]).toEqual(audits);
  });

  it("rejects changed or deleted members without changing the remaining selection", async () => {
    const second = await newDrive();
    const operation = await actions.bulkSetDriveClassification([driveId, second], "private");
    await state.db!.delete(drives).where(eq(drives.id, second));
    const before = await current();
    expect(await actions.undoDriveClassification(operation!.operationId)).toEqual({ ok: false, error: "undo.conflict" });
    expect(await current()).toEqual(before);
  });

  it("makes duplicate and simultaneous undo idempotent, including a retry after expiry", async () => {
    const operation = await actions.bulkSetDriveClassification([driveId, await newDrive()], "commute");
    const results = await Promise.all([actions.undoDriveClassification(operation!.operationId), actions.undoDriveClassification(operation!.operationId)]);
    expect(results.every(result => result.ok)).toBe(true);
    expect(await history()).toHaveLength(2);
    await state.db!.update(classificationOperations).set({ expiresAt: new Date(0) }).where(eq(classificationOperations.id, operation!.operationId));
    expect(await actions.undoDriveClassification(operation!.operationId)).toMatchObject({ ok: true });
    expect(await history()).toHaveLength(2);
  });

  it("serializes simultaneous classifications and undo/new-classification races", async () => {
    await Promise.all([actions.setDriveClassification(driveId, "private"), actions.setDriveClassification(driveId, "business")]);
    const entries = await history();
    expect(entries).toHaveLength(2);
    expect(entries[1]!.oldValue).toBe(entries[0]!.newValue);
    const latest = await actions.getLatestClassificationOperation();
    await Promise.all([actions.undoDriveClassification(latest!.operationId), actions.setDriveClassification(driveId, "commute")]);
    expect((await current()).classification).toBe("commute");
    const chain = await history();
    chain.slice(1).forEach((entry, index) => expect(entry.oldValue).toBe(chain[index]!.newValue));
  });

  it("rejects unauthorized user, another session of the same user, and logged-out callers", async () => {
    const operation = await actions.setDriveClassification(driveId, "private");
    const before = await current();
    state.sessionId = secondSessionId;
    expect(await actions.undoDriveClassification(operation!.operationId)).toEqual({ ok: false, error: "undo.unavailable" });
    state.userId = otherUserId; state.sessionId = otherSessionId;
    expect(await actions.undoDriveClassification(operation!.operationId)).toEqual({ ok: false, error: "undo.unavailable" });
    state.authenticated = false;
    expect(await actions.undoDriveClassification(operation!.operationId)).toEqual({ ok: false, error: "errors.notAuthenticated" });
    await expect(actions.setDriveClassification(driveId, "business")).rejects.toThrow("errors.notAuthenticated");
    expect(await current()).toEqual(before);
  });

  it("reports expired and invalid operations without changing values, revision, or audit history", async () => {
    const operation = await actions.setDriveClassification(driveId, "private");
    await state.db!.update(classificationOperations).set({ expiresAt: new Date(0) }).where(eq(classificationOperations.id, operation!.operationId));
    const before = await current(); const audits = await history();
    expect((await actions.getLatestClassificationOperation())!.status).toBe("expired");
    expect(await actions.undoDriveClassification(operation!.operationId)).toEqual({ ok: false, error: "undo.expired" });
    for (const id of [-1, 9007199254740990]) expect(await actions.undoDriveClassification(id)).toEqual({ ok: false, error: "undo.unavailable" });
    expect(await current()).toEqual(before); expect(await history()).toEqual(audits);
  });

  it("does not create phantom operations or audit rows for unchanged data or unchanged forms", async () => {
    const before = await current();
    expect(await actions.setDriveClassification(driveId, "unclassified")).toBeNull();
    const form = new FormData(); form.set("driveId", String(driveId)); form.set("classification", "unclassified"); form.set("notes", "Preserve this note");
    expect(await actions.updateDriveAnnotations({ ok: false }, form)).toMatchObject({ ok: true });
    expect(await current()).toEqual(before); expect(await history()).toHaveLength(0);
  });

  it("keeps explicit form saves separate from quick undo and detects their later classifications", async () => {
    const operation = await actions.setDriveClassification(driveId, "business");
    const form = new FormData(); form.set("driveId", String(driveId)); form.set("classification", "private"); form.set("notes", " Explicitly saved note ");
    expect(await actions.updateDriveAnnotations({ ok: false }, form)).toMatchObject({ ok: true, values: { notes: "Explicitly saved note" } });
    expect(await actions.undoDriveClassification(operation!.operationId)).toEqual({ ok: false, error: "undo.conflict" });
    expect(await current()).toMatchObject({ classification: "private", notes: "Explicitly saved note" });
  });

  it("reports complete daily duration and keeps incomplete duration unknown", async () => {
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

  it("rejects invalid membership and classification input without partial updates", async () => {
    const before = await current();
    await expect(actions.bulkSetDriveClassification([driveId, 9007199254740990], "private")).rejects.toThrow("errors.driveNotFound");
    await expect(actions.setDriveClassification(-1, "private")).rejects.toThrow();
    await expect(actions.setDriveClassification(driveId, "malicious" as "private")).rejects.toThrow();
    expect(await current()).toEqual(before); expect(await history()).toHaveLength(0);
  });

  it("preserves the audit chain when mixed explicit bulk and quick edits overlap", async () => {
    await Promise.all([actions.bulkUpdateDrives({ driveIds: [driveId], classification: "business", purpose: "Bulk purpose" }), actions.setDriveClassification(driveId, "private")]);
    const entries = await history();
    expect(entries).toHaveLength(2); expect(entries[1]!.oldValue).toBe(entries[0]!.newValue);
    expect(await current()).toMatchObject({ classification: entries[1]!.newValue, purpose: "Bulk purpose", notes: "Preserve this note" });
  });
});
