import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { auditLog, chargeSessions, invoiceUploads, invoices, settings, vehicles, type InvoiceMetadata } from "@odovi/db";
import { ZipFile } from "yazl";
import { db } from "../db";
import { hash, INVOICE_LIMITS, InvoiceError, matchCandidates, metadataSchema, parseMetadata, parseUpload } from "./processing";

const ENABLED = "invoiceArchiveEnabled";
const summary = { id: invoices.id, uploadId: invoices.uploadId, filename: invoices.filename, sha256: invoices.sha256,
  byteSize: invoices.byteSize, parsedMetadata: invoices.parsedMetadata, reviewedMetadata: invoices.reviewedMetadata,
  parserVersion: invoices.parserVersion,
  chargeSessionId: invoices.chargeSessionId, enrichment: invoices.enrichment };
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
// Serialize archive mutations across web replicas; the database also owns quota/index/blobs.
async function lock(tx: Transaction) { await tx.execute(sql`select pg_advisory_xact_lock(716251)`); }

export async function archiveEnabled() {
  const [setting] = await db.select().from(settings).where(eq(settings.key, ENABLED));
  return setting?.value === true;
}
export async function setArchiveEnabled(enabled: boolean, actor: string) {
  await db.transaction(async (tx) => {
    await lock(tx);
    const [before] = await tx.select().from(settings).where(eq(settings.key, ENABLED));
    await tx.insert(settings).values({ key: ENABLED, value: enabled }).onConflictDoUpdate({ target: settings.key, set: { value: enabled, updatedAt: new Date() } });
    if ((before?.value === true) !== enabled) await tx.insert(auditLog).values({ entityType: "invoice_archive", entityId: 0, field: "enabled", oldValue: String(before?.value === true), newValue: String(enabled), changedBy: actor });
  });
}

export async function importUpload(data: Buffer, filename: string, actor: string) {
  if (!await archiveEnabled()) throw new InvoiceError("archive-disabled", 409);
  const parsed = await parseUpload(data, filename);
  const uploadHash = hash(data);
  const records = parsed.map((pdf) => ({ filename: pdf.filename, original: pdf.original, byteSize: pdf.original.length,
    sha256: hash(pdf.original), extractedText: pdf.text, parsedMetadata: parseMetadata(pdf.text), parserVersion: "odovi-metadata-v1/pdfjs-6.3.289" }));
  if (new Set(records.map((r) => r.sha256)).size !== records.length) throw new InvoiceError("duplicate-pdf-in-upload", 409);
  return db.transaction(async (tx) => {
    await lock(tx);
    const [enabled] = await tx.select().from(settings).where(eq(settings.key, ENABLED));
    if (enabled?.value !== true) throw new InvoiceError("archive-disabled", 409);
    const [existing] = await tx.select({ id: invoiceUploads.id }).from(invoiceUploads).where(eq(invoiceUploads.sha256, uploadHash));
    if (existing) return { uploadId: existing.id, duplicate: true };
    const duplicates = await tx.select({ id: invoices.id }).from(invoices).where(inArray(invoices.sha256, records.map((r) => r.sha256))).limit(1);
    if (duplicates.length) throw new InvoiceError("pdf-already-archived", 409);
    const [uploadsSize] = await tx.select({ size: sql<number>`coalesce(sum(${invoiceUploads.byteSize}), 0)::bigint` }).from(invoiceUploads);
    const [pdfsSize] = await tx.select({ size: sql<number>`coalesce(sum(${invoices.byteSize}), 0)::bigint` }).from(invoices);
    const used = Number(uploadsSize!.size) + Number(pdfsSize!.size);
    if (used + data.length + records.reduce((sum, r) => sum + r.byteSize, 0) > INVOICE_LIMITS.archiveBytes) throw new InvoiceError("archive-full", 413);
    const [upload] = await tx.insert(invoiceUploads).values({ filename, original: data, byteSize: data.length, sha256: uploadHash, importedBy: actor }).returning({ id: invoiceUploads.id });
    await tx.insert(invoices).values(records.map((r) => ({ ...r, uploadId: upload!.id })));
    await tx.insert(auditLog).values({ entityType: "invoice_upload", entityId: upload!.id, field: "import", oldValue: null, newValue: uploadHash, changedBy: actor });
    return { uploadId: upload!.id, duplicate: false };
  });
}

async function suggestions(metadata: InvoiceMetadata) {
  if (!metadata.chargingStart && !metadata.invoiceDate) return { status: "unmatched" as const, candidates: [] };
  const center = new Date(metadata.chargingStart ?? `${metadata.invoiceDate}T12:00:00Z`).getTime();
  const window = metadata.chargingStart ? 10 * 60_000 : 36 * 60 * 60_000;
  const candidates = await db.select({ id: chargeSessions.id, vin: vehicles.vin, startTime: chargeSessions.startTime, energyAddedKwh: chargeSessions.energyAddedKwh })
    .from(chargeSessions).innerJoin(vehicles, eq(vehicles.id, chargeSessions.vehicleId))
    .where(and(eq(chargeSessions.chargerType, "dc"), isNotNull(chargeSessions.endTime),
      gte(chargeSessions.startTime, new Date(center - window)), lt(chargeSessions.startTime, new Date(center + window)),
      metadata.vin ? eq(vehicles.vin, metadata.vin) : undefined)).orderBy(asc(chargeSessions.startTime)).limit(51);
  if (candidates.length > 50) return { status: "unmatched" as const, candidates: [] };
  return matchCandidates(metadata, candidates);
}

export async function listArchive() {
  const records = await db.select(summary).from(invoices).orderBy(desc(invoices.id)).limit(100);
  const uploads = records.length ? await db.select({ id: invoiceUploads.id, filename: invoiceUploads.filename, sha256: invoiceUploads.sha256,
    importedAt: invoiceUploads.importedAt, byteSize: invoiceUploads.byteSize }).from(invoiceUploads)
    .where(inArray(invoiceUploads.id, records.map((r) => r.uploadId))).orderBy(desc(invoiceUploads.id)) : [];
  // Bound concurrent suggestion queries for a ZIP-heavy archive.
  const annotated = [];
  for (const record of records) annotated.push({ ...record,
    match: record.chargeSessionId ? { status: "matched" as const, confirmed: true, candidates: [] } : { ...await suggestions(record.reviewedMetadata ?? record.parsedMetadata), confirmed: false } });
  return { enabled: await archiveEnabled(), uploads, invoices: annotated, limits: INVOICE_LIMITS };
}

export async function reviewInvoice(id: number, metadata: InvoiceMetadata, chargeId: number | null, enrich: boolean, actor: string) {
  const validated = metadataSchema.safeParse(metadata);
  if (!validated.success) throw new InvoiceError("invalid-metadata");
  if (enrich && (chargeId == null || metadata.total == null || metadata.currency == null)) throw new InvoiceError("cost-requires-match-and-amount");
  await db.transaction(async (tx) => {
    await lock(tx);
    const [record] = await tx.select().from(invoices).where(eq(invoices.id, id)).for("update");
    if (!record) throw new InvoiceError("invoice-not-found", 404);
    if (record.enrichment) throw new InvoiceError("delete-upload-before-reassigning-enrichment", 409);
    let enrichment = null;
    if (chargeId != null) {
      const [charge] = await tx.select().from(chargeSessions).where(eq(chargeSessions.id, chargeId)).for("update");
      if (!charge || charge.chargerType !== "dc" || !charge.endTime) throw new InvoiceError("invalid-charge-match");
      const [vehicle] = await tx.select({ vin: vehicles.vin }).from(vehicles).where(eq(vehicles.id, charge.vehicleId));
      if (metadata.vin && vehicle?.vin !== metadata.vin) throw new InvoiceError("vehicle-mismatch");
      const [linked] = await tx.select({ id: invoices.id }).from(invoices).where(eq(invoices.chargeSessionId, chargeId));
      if (linked && linked.id !== id) throw new InvoiceError("charge-already-matched", 409);
      if (enrich) {
        if (charge.costSource !== "auto" && (charge.costSource != null || charge.cost != null)) throw new InvoiceError("existing-cost-protected", 409);
        const previous = { cost: charge.cost, currency: charge.currency, costSource: charge.costSource };
        const applied = { cost: validated.data.total, currency: validated.data.currency, costSource: `invoice:${id}` };
        enrichment = { previous, applied };
        await tx.update(chargeSessions).set({ ...applied, updatedAt: new Date() }).where(eq(chargeSessions.id, chargeId));
        await tx.insert(auditLog).values({ entityType: "charge_session", entityId: chargeId, field: "invoice_cost", oldValue: JSON.stringify(previous), newValue: JSON.stringify(applied), changedBy: actor });
      }
    }
    await tx.update(invoices).set({ reviewedMetadata: validated.data, chargeSessionId: chargeId, enrichment }).where(eq(invoices.id, id));
    await tx.insert(auditLog).values({ entityType: "invoice", entityId: id, field: "review", oldValue: JSON.stringify({ metadata: record.reviewedMetadata, chargeSessionId: record.chargeSessionId }), newValue: JSON.stringify({ metadata: validated.data, chargeSessionId: chargeId }), changedBy: actor });
  });
}

/** Deletion is per original upload: a retained ZIP must not retain deleted PDFs. */
export async function deleteUpload(id: number, actor: string) {
  return db.transaction(async (tx) => {
    await lock(tx);
    const [upload] = await tx.select({ sha256: invoiceUploads.sha256 }).from(invoiceUploads).where(eq(invoiceUploads.id, id)).for("update");
    if (!upload) throw new InvoiceError("upload-not-found", 404);
    const records = await tx.select().from(invoices).where(eq(invoices.uploadId, id)).orderBy(asc(invoices.chargeSessionId)).for("update");
    let restored = 0, preserved = 0;
    for (const record of records) {
      if (record.chargeSessionId == null || !record.enrichment) continue;
      const [charge] = await tx.select().from(chargeSessions).where(eq(chargeSessions.id, record.chargeSessionId)).for("update");
      const { previous, applied } = record.enrichment;
      const unchanged = charge && charge.cost === applied.cost && charge.currency === applied.currency && charge.costSource === applied.costSource;
      if (unchanged) {
        await tx.update(chargeSessions).set({ ...previous, updatedAt: new Date() }).where(eq(chargeSessions.id, record.chargeSessionId));
        restored++;
      } else preserved++;
      await tx.insert(auditLog).values({ entityType: "charge_session", entityId: record.chargeSessionId, field: "invoice_cost_delete", oldValue: JSON.stringify(applied), newValue: unchanged ? JSON.stringify(previous) : "subsequent-change-preserved", changedBy: actor });
    }
    await tx.delete(invoices).where(eq(invoices.uploadId, id));
    await tx.delete(invoiceUploads).where(eq(invoiceUploads.id, id));
    await tx.insert(auditLog).values({ entityType: "invoice_upload", entityId: id, field: "delete", oldValue: upload.sha256, newValue: null, changedBy: actor });
    return { restored, preserved };
  });
}

export async function originalDownload(kind: "invoice" | "upload", id: number) {
  const table = kind === "invoice" ? invoices : invoiceUploads;
  const [record] = await db.select({ original: table.original, filename: table.filename, sha256: table.sha256 }).from(table).where(eq(table.id, id));
  if (!record) throw new InvoiceError("original-not-found", 404);
  if (hash(record.original) !== record.sha256) throw new InvoiceError("original-integrity-failed", 409);
  return record;
}

export async function monthlyExport(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new InvoiceError("invalid-month");
  return db.transaction(async (tx) => {
    // A consistent snapshot also excludes a delete occurring halfway through export.
    await tx.execute(sql`set transaction isolation level repeatable read`);
    const rows = await tx.select({ ...summary, uploadedAt: invoiceUploads.importedAt, uploadedBy: invoiceUploads.importedBy,
      uploadFilename: invoiceUploads.filename, uploadHash: invoiceUploads.sha256 })
      .from(invoices).innerJoin(invoiceUploads, eq(invoiceUploads.id, invoices.uploadId))
      .where(sql`coalesce(${invoices.reviewedMetadata}->>'invoiceDate', ${invoices.parsedMetadata}->>'invoiceDate', to_char(${invoiceUploads.importedAt} at time zone 'UTC', 'YYYY-MM-DD')) like ${month + "-%"}`)
      .orderBy(asc(invoices.id));
    if (rows.length > 500 || rows.reduce((s, r) => s + r.byteSize, 0) > INVOICE_LIMITS.exportBytes) throw new InvoiceError("export-limit-exceeded", 413);
    const originals = rows.length ? await tx.select({ id: invoices.id, original: invoices.original }).from(invoices).where(inArray(invoices.id, rows.map((r) => r.id))) : [];
    const zip = new ZipFile();
    const manifest = { version: 1, month, exportedAt: new Date().toISOString(), dateBasis: "Reviewed invoice date, parsed invoice date, then UTC import date", invoices: rows };
    zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2)), "manifest.json");
    for (const record of rows) {
      const original = originals.find((r) => r.id === record.id)!.original;
      if (hash(original) !== record.sha256) throw new InvoiceError("original-integrity-failed", 409);
      zip.addBuffer(original, `pdfs/${record.id}-${record.sha256}.pdf`, { compress: false });
    }
    const result = new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      zip.outputStream.on("data", (chunk: Buffer) => chunks.push(chunk));
      zip.outputStream.once("error", reject);
      zip.outputStream.once("end", () => resolve(Buffer.concat(chunks)));
    });
    zip.end();
    return result;
  });
}
