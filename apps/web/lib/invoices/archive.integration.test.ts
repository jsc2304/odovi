import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { auditLog, chargeSessions, createDbConnection, invoiceUploads, invoices, places, sessions, users, vehicles, type Db } from "@odovi/db";
import { NextRequest } from "next/server";
import yauzl from "yauzl";
import { hash, parseMetadata } from "./processing";
import { fixturePdf, fixtureZip } from "./fixtures.test-support";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ db: null as Db | null, token: "forged" }));
vi.mock("../db", () => ({ get db() { return state.db; } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: state.token }) }), headers: async () => new Headers() }));
const databaseUrl = process.env.ODOVI_INVOICE_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)("durable authenticated invoice archive", () => {
  const actor = `invoice-test-${randomUUID()}`;
  let connection: ReturnType<typeof createDbConnection>;
  let archive: typeof import("./archive");
  let routes: typeof import("../../app/api/invoices/[[...path]]/route");
  let chargeId: number, manualId: number, placeId: number, vehicleId: number, userId: number;
  const metadata = parseMetadata(fixturePdf().toString());
  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/odovi_invoice_test") throw new Error("Use only the disposable local odovi_invoice_test database.");
    connection = createDbConnection(databaseUrl!);
    state.db = connection.db;
    archive = await import("./archive");
    routes = await import("../../app/api/invoices/[[...path]]/route");
    const [user] = await connection.db.insert(users).values({ username: actor, passwordHash: "synthetic-test-only" }).returning(); userId = user!.id;
    const [vehicle] = await connection.db.insert(vehicles).values({ displayName: "Invoice fixture", vin: "5YJ3E7EA1MF000001", source: actor, sourceId: "vehicle" }).returning(); vehicleId = vehicle!.id;
    const [place] = await connection.db.insert(places).values({ name: "Fixture", lat: 47, lon: 8, electricityPricePerKwh: "0.50", electricityPriceCurrency: "EUR" }).returning(); placeId = place!.id;
    const charges = await connection.db.insert(chargeSessions).values([
      { vehicleId, placeId, source: actor, sourceId: "auto", chargerType: "dc", startTime: new Date("2026-09-01T10:00:00Z"), endTime: new Date("2026-09-01T10:30:00Z"), energyAddedKwh: 40, cost: "20.00", currency: "EUR", costSource: "auto" },
      { vehicleId, placeId, source: actor, sourceId: "manual", chargerType: "dc", startTime: new Date("2026-09-02T10:00:00Z"), endTime: new Date("2026-09-02T10:30:00Z"), energyAddedKwh: 40, cost: "30.00", currency: "CHF", costSource: "manual" },
    ]).returning(); chargeId = charges[0]!.id; manualId = charges[1]!.id;
    await archive.setArchiveEnabled(true, actor);
  });
  afterAll(async () => {
    if (!connection) return;
    const owned = await connection.db.select({ id: invoiceUploads.id }).from(invoiceUploads).where(eq(invoiceUploads.importedBy, actor));
    for (const upload of owned) await archive.deleteUpload(upload.id, actor);
    await connection.db.delete(auditLog).where(eq(auditLog.changedBy, actor));
    await connection.db.delete(sessions).where(eq(sessions.userId, userId));
    await connection.db.delete(users).where(eq(users.id, userId));
    await connection.db.delete(chargeSessions).where(eq(chargeSessions.source, actor));
    await connection.db.delete(places).where(eq(places.id, placeId));
    await connection.db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await archive.setArchiveEnabled(false, actor);
    await connection.close();
  });
  const context = (path: string[] = []) => ({ params: Promise.resolve({ path }) });

  it("rejects forged/expired cookies using real persisted sessions in every handler", async () => {
    const request = new NextRequest("http://localhost/api/invoices", { headers: { cookie: "odovi_session=forged" } });
    for (const handler of [routes.GET, routes.POST, routes.PATCH, routes.DELETE]) expect((await handler(request, context())).status).toBe(401);
    const expired = "expired-test-token";
    await connection.db.insert(sessions).values({ id: hash(Buffer.from(expired)), userId, expiresAt: new Date(0) });
    state.token = expired;
    expect((await routes.GET(request, context())).status).toBe(401);
    expect(await connection.db.select().from(sessions).where(eq(sessions.id, hash(Buffer.from(expired))))).toHaveLength(0);
    state.token = randomUUID();
    await connection.db.insert(sessions).values({ id: hash(Buffer.from(state.token)), userId, expiresAt: new Date(Date.now() + 60_000) });
    expect((await routes.GET(request, context())).status).toBe(200);
  });

  it("imports atomically, detects duplicates, matches conservatively and survives a fresh DB connection", async () => {
    const pdf = fixturePdf();
    const imported = await archive.importUpload(pdf, "original.pdf", actor);
    expect((await archive.importUpload(pdf, "renamed.pdf", actor)).uploadId).toBe(imported.uploadId);
    const listing = await archive.listArchive();
    const record = listing.invoices.find((r) => r.uploadId === imported.uploadId)!;
    expect(record.match.status).toBe("matched");
    expect(record.match.confirmed).toBe(false);
    const fresh = createDbConnection(databaseUrl!);
    const [persisted] = await fresh.db.select().from(invoices).where(eq(invoices.id, record.id));
    expect(hash(persisted!.original)).toBe(record.sha256);
    expect(persisted!.parsedMetadata).toEqual(metadata);
    await fresh.close();
    const before = await connection.db.select().from(invoiceUploads);
    await expect(archive.importUpload(await fixtureZip([["new.pdf", fixturePdf("Tesla Invoice number: OTHER")], ["bad.pdf", Buffer.from("bad")]]), "partial.zip", actor)).rejects.toThrow("invalid-upload");
    await expect(archive.importUpload(await fixtureZip([["original.pdf", pdf]]), "duplicate.zip", actor)).rejects.toThrow("pdf-already-archived");
    expect(await connection.db.select().from(invoiceUploads)).toHaveLength(before.length);
    await archive.reviewInvoice(record.id, metadata, chargeId, true, actor);
    const [enriched] = await connection.db.select().from(chargeSessions).where(eq(chargeSessions.id, chargeId));
    expect(enriched).toMatchObject({ cost: "12.34", currency: "EUR", costSource: `invoice:${record.id}` });
    const { applyAutoChargeCosts } = await import("../../../worker/src/sync/chargeCosts");
    await applyAutoChargeCosts(connection.db);
    // Reproduce a worker that selected an auto row before the invoice transaction.
    // Its UPDATE runs against the real database after enrichment has committed.
    let selects = 0;
    const staleDb = {
      update: connection.db.update.bind(connection.db),
      select: () => {
        const query = { from: () => query, leftJoin: () => query, innerJoin: () => query,
          where: async () => ++selects === 1 ? [] : [{ id: chargeId, energyAddedKwh: 40,
            cost: "20.00", currency: "EUR", costSource: "auto", pricePerKwh: "0.60", priceCurrency: "EUR" }] };
        return query;
      },
    } as unknown as Db;
    await applyAutoChargeCosts(staleDb);
    expect((await connection.db.select().from(chargeSessions).where(eq(chargeSessions.id, chargeId)))[0]!.costSource).toBe(`invoice:${record.id}`);
    const result = await archive.deleteUpload(imported.uploadId, actor);
    expect(result).toEqual({ restored: 1, preserved: 0 });
    expect((await connection.db.select().from(chargeSessions).where(eq(chargeSessions.id, chargeId)))[0]).toMatchObject({ cost: "20.00", currency: "EUR", costSource: "auto" });
    expect(await connection.db.select().from(invoices).where(eq(invoices.id, record.id))).toHaveLength(0);
  });

  it("protects manual/synced costs and preserves later edits when deleting enrichment", async () => {
    const imported = await archive.importUpload(fixturePdf("Tesla Invoice number: PROTECTED"), "protected.pdf", actor);
    const [record] = await connection.db.select().from(invoices).where(eq(invoices.uploadId, imported.uploadId));
    for (const costSource of ["manual", "synced"]) {
      await connection.db.update(chargeSessions).set({ costSource }).where(eq(chargeSessions.id, manualId));
      await expect(archive.reviewInvoice(record!.id, metadata, manualId, true, actor)).rejects.toThrow("existing-cost-protected");
    }
    await archive.reviewInvoice(record!.id, metadata, chargeId, true, actor);
    await connection.db.update(chargeSessions).set({ cost: "15.00", currency: "CHF", costSource: "manual" }).where(eq(chargeSessions.id, chargeId));
    expect(await archive.deleteUpload(imported.uploadId, actor)).toEqual({ restored: 0, preserved: 1 });
    expect((await connection.db.select().from(chargeSessions).where(eq(chargeSessions.id, chargeId)))[0]).toMatchObject({ cost: "15.00", currency: "CHF", costSource: "manual" });
    expect(await connection.db.select().from(auditLog).where(and(eq(auditLog.entityId, chargeId), eq(auditLog.field, "invoice_cost_delete")))).toHaveLength(2);
  });

  it("exports original bytes, hashes, reviewed metadata and cost provenance in a monthly ZIP", async () => {
    const original = fixturePdf("Tesla Invoice number: EXPORT Invoice date: 2026-08-03");
    const imported = await archive.importUpload(original, "export.pdf", actor);
    const [record] = await connection.db.select().from(invoices).where(eq(invoices.uploadId, imported.uploadId));
    await archive.reviewInvoice(record!.id, { ...record!.parsedMetadata, invoiceDate: "2026-09-03" }, null, false, actor);
    const zip = await archive.monthlyExport("2026-09");
    const files = await new Promise<Map<string, Buffer>>((resolve, reject) => yauzl.fromBuffer(zip, { lazyEntries: true }, (error, reader) => {
      if (error) return reject(error);
      const output = new Map<string, Buffer>();
      reader.on("error", reject); reader.on("end", () => resolve(output));
      reader.on("entry", (entry) => reader.openReadStream(entry, async (err, stream) => {
        if (err) return reject(err);
        const chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(chunk);
        output.set(entry.fileName, Buffer.concat(chunks)); reader.readEntry();
      })); reader.readEntry();
    }));
    expect(files.get(`pdfs/${record!.id}-${record!.sha256}.pdf`)!.equals(original)).toBe(true);
    const manifest = JSON.parse(files.get("manifest.json")!.toString());
    expect(manifest.invoices.find((r: { id: number }) => r.id === record!.id)).toMatchObject({ sha256: hash(original), parsedMetadata: { invoiceDate: "2026-08-03" }, reviewedMetadata: { invoiceDate: "2026-09-03" } });
    await archive.reviewInvoice(record!.id, { ...record!.parsedMetadata, invoiceDate: null }, null, false, actor);
    const entry = Buffer.from(`pdfs/${record!.id}-${record!.sha256}.pdf`);
    expect((await archive.monthlyExport("2026-08")).includes(entry)).toBe(false);
    const [upload] = await connection.db.select().from(invoiceUploads).where(eq(invoiceUploads.id, imported.uploadId));
    expect((await archive.monthlyExport(upload!.importedAt.toISOString().slice(0, 7))).includes(entry)).toBe(true);
    await expect(archive.monthlyExport("2026-13")).rejects.toThrow("invalid-month");
  });

  it("keeps import/delete races and batch deletion free of orphaned originals", async () => {
    const pdf = fixturePdf("Tesla Invoice number: RACE");
    const first = await archive.importUpload(pdf, "race.pdf", actor);
    const results = await Promise.allSettled([archive.importUpload(pdf, "race.pdf", actor), archive.deleteUpload(first.uploadId, actor)]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const orphans = await connection.db.execute(sql`select id from invoice_uploads u where not exists (select 1 from invoices i where i.upload_id = u.id)`);
    expect(orphans).toHaveLength(0);
    const imported = await archive.importUpload(await fixtureZip([["a.pdf", fixturePdf("Tesla Invoice number: BATCH-A")], ["b.pdf", fixturePdf("Tesla Invoice number: BATCH-B")]]), "batch.zip", actor);
    expect(await connection.db.select().from(invoices).where(eq(invoices.uploadId, imported.uploadId))).toHaveLength(2);
    await archive.deleteUpload(imported.uploadId, actor);
    expect(await connection.db.select().from(invoices).where(eq(invoices.uploadId, imported.uploadId))).toHaveLength(0);
  });
});
