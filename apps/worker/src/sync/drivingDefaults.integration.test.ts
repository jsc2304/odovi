import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { auditLog, classificationRules, createDbConnection, drives, settings, vehicles } from "@odovi/db";
import { drivingProfileKey } from "@odovi/core";
import { applyDrivingDefaults } from "./drivingDefaults.js";

const databaseUrl = process.env.ODOVI_CLASSIFICATION_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)("driving profile defaults", () => {
  const source = `profile-test-${randomUUID()}`;
  let connection: ReturnType<typeof createDbConnection>;
  let vehicleId: number;
  let otherVehicleId: number;
  const ruleIds: number[] = [];

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || !["/odovi_classification_test", "/odovi_paper_ink_test"].includes(url.pathname)) throw new Error("Use a disposable local classification test database.");
    connection = createDbConnection(databaseUrl!);
    const cars = await connection.db.insert(vehicles).values([
      { displayName: "Profile test", source, sourceId: "car" },
      { displayName: "Other profile test", source, sourceId: "other" },
    ]).returning();
    vehicleId = cars[0]!.id;
    otherVehicleId = cars[1]!.id;
  });

  async function clean() {
    const owned = await connection.db.select({ id: drives.id }).from(drives).where(inArray(drives.vehicleId, [vehicleId, otherVehicleId]));
    if (owned.length) await connection.db.delete(auditLog).where(and(eq(auditLog.entityType, "drive"), inArray(auditLog.entityId, owned.map(d => d.id))));
    await connection.db.delete(drives).where(inArray(drives.vehicleId, [vehicleId, otherVehicleId]));
    await connection.db.delete(settings).where(inArray(settings.key, [drivingProfileKey(vehicleId), drivingProfileKey(otherVehicleId)]));
    if (ruleIds.length) await connection.db.delete(classificationRules).where(inArray(classificationRules.id, ruleIds));
    ruleIds.length = 0;
  }
  beforeEach(clean);
  afterAll(async () => {
    if (!connection) return;
    await clean();
    await connection.db.delete(vehicles).where(eq(vehicles.source, source));
    await connection.close();
  });

  const profile = async (usage: "private" | "business" | "balanced", effectiveFrom = "2030-01-01T00:00:00Z") => {
    const value = { usage, effectiveFrom };
    await connection.db.insert(settings).values({ key: drivingProfileKey(vehicleId), value })
      .onConflictDoUpdate({ target: settings.key, set: { value } });
  };
  const drive = async (patch: Partial<typeof drives.$inferInsert> = {}) => {
    const [row] = await connection.db.insert(drives).values({ vehicleId, source, sourceId: randomUUID(),
      startTime: new Date("2030-01-07T10:00:00Z"), endTime: new Date("2030-01-07T10:30:00Z"),
      notes: "Keep this note", ...patch }).returning();
    return row!;
  };
  const current = async (id: number) => (await connection.db.select().from(drives).where(eq(drives.id, id)))[0]!;
  const run = () => applyDrivingDefaults(connection.db, "Europe/Berlin");
  const rule = async (classification: "business" | "unclassified" | null) => {
    const [row] = await connection.db.insert(classificationRules).values({ name: source, weekdays: [1], classification, purpose: "Rule purpose" }).returning();
    ruleIds.push(row!.id);
    return row!;
  };

  it("applies only to completed new drives of the chosen vehicle, including delayed arrivals", async () => {
    await profile("private");
    const old = await drive({ startTime: new Date("2020-01-01T10:00:00Z") });
    const boundary = await drive({ startTime: new Date("2030-01-01T00:00:00Z") });
    const open = await drive({ endTime: null });
    const other = await drive({ vehicleId: otherVehicleId });
    const classified = await drive({ classification: "commute" });
    const fresh = await drive();
    expect(await run()).toEqual({ applied: 1 });
    expect(await current(fresh.id)).toMatchObject({ classification: "private", notes: "Keep this note" });
    for (const row of [old, boundary, open, other]) expect((await current(row.id)).classification).toBe("unclassified");
    expect((await current(classified.id)).classification).toBe("commute");
    const delayed = await drive();
    expect(await run()).toEqual({ applied: 1 });
    expect((await current(delayed.id)).classification).toBe("private");
    expect(await run()).toEqual({ applied: 0 });
  });

  it("leaves drives open for an unanswered, balanced or malformed profile", async () => {
    const row = await drive();
    expect(await run()).toEqual({ applied: 0 });
    await profile("balanced");
    expect(await run()).toEqual({ applied: 0 });
    await connection.db.update(settings).set({ value: { usage: "private", effectiveFrom: "invalid" } }).where(eq(settings.key, drivingProfileKey(vehicleId)));
    expect(await run()).toEqual({ applied: 0 });
    expect((await current(row.id)).classification).toBe("unclassified");
  });

  it("keeps manual corrections, explicit unclassification and Undo across later syncs", async () => {
    await profile("private");
    const row = await drive();
    await run();
    await connection.db.transaction(async tx => {
      await tx.update(drives).set({ classification: "unclassified" }).where(eq(drives.id, row.id));
      await tx.insert(auditLog).values({ entityType: "drive", entityId: row.id, field: "classification", oldValue: "private", newValue: "unclassified", changedBy: "test-user" });
    });
    await rule("business");
    expect(await run()).toEqual({ applied: 0 });
    expect((await current(row.id)).classification).toBe("unclassified");
  });

  it("gives rules precedence even behind 500 older unmatched drives", async () => {
    await profile("private");
    await connection.db.insert(drives).values(Array.from({ length: 500 }, (_, i) => ({
      vehicleId, source, sourceId: `backlog-${i}`, startTime: new Date("2020-01-07T10:00:00Z"), endTime: new Date("2020-01-07T10:30:00Z"),
    })));
    await rule("business");
    const row = await drive();
    expect(await run()).toEqual({ applied: 0 });
    expect(await current(row.id)).toMatchObject({ classification: "business", purpose: "Rule purpose" });
  });

  it("allows a purpose-only rule with a default but respects an explicit open rule", async () => {
    await profile("business");
    const purposeRule = await rule(null);
    const row = await drive();
    expect(await run()).toEqual({ applied: 1 });
    expect(await current(row.id)).toMatchObject({ classification: "business", purpose: "Rule purpose", classifiedByRuleId: purposeRule.id });
    await connection.db.update(classificationRules).set({ classification: "unclassified" }).where(eq(classificationRules.id, purposeRule.id));
    const explicitOpen = await drive();
    expect(await run()).toEqual({ applied: 0 });
    expect((await current(explicitOpen.id)).classification).toBe("unclassified");
    expect(await run()).toEqual({ applied: 0 });
  });

  it("serializes overlapping worker passes without duplicate default audits", async () => {
    await profile("business");
    const row = await drive();
    const results = await Promise.all([run(), run()]);
    expect(results.reduce((n, result) => n + result.applied, 0)).toBe(1);
    const entries = await connection.db.select().from(auditLog).where(and(eq(auditLog.entityType, "drive"), eq(auditLog.entityId, row.id)));
    expect(entries).toHaveLength(1);
    expect(entries[0]!.changedBy).toBe("default:business");
  });
});
