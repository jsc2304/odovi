import { bigint, customType, index, integer, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { chargeSessions } from "./schema.js";

// PostgreSQL bytea keeps originals and the index in the same durable transaction.
// https://orm.drizzle.team/docs/custom-types
const bytes = customType<{ data: Buffer }>({ dataType: () => "bytea" });
const id = () => bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey();

export interface InvoiceMetadata {
  invoiceNumber: string | null;
  invoiceDate: string | null;
  vin: string | null;
  chargingStart: string | null;
  energyKwh: number | null;
  total: string | null;
  currency: string | null;
}

export const invoiceUploads = pgTable("invoice_uploads", {
  id: id(), filename: text("filename").notNull(), sha256: text("sha256").notNull(),
  original: bytes("original").notNull(), byteSize: integer("byte_size").notNull(),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  importedBy: text("imported_by").notNull(),
}, (t) => [unique("invoice_uploads_hash_uq").on(t.sha256)]);

export const invoices = pgTable("invoices", {
  id: id(), uploadId: bigint("upload_id", { mode: "number" }).notNull().references(() => invoiceUploads.id),
  filename: text("filename").notNull(), sha256: text("sha256").notNull(),
  original: bytes("original").notNull(), byteSize: integer("byte_size").notNull(),
  extractedText: text("extracted_text").notNull(), parsedMetadata: jsonb("parsed_metadata").$type<InvoiceMetadata>().notNull(),
  parserVersion: text("parser_version").notNull(),
  reviewedMetadata: jsonb("reviewed_metadata").$type<InvoiceMetadata>(),
  chargeSessionId: bigint("charge_session_id", { mode: "number" }).references(() => chargeSessions.id),
  // Unique source marker and the exact prior/applied triples make deletion reversible.
  enrichment: jsonb("enrichment").$type<{ previous: InvoiceCost; applied: InvoiceCost }>(),
}, (t) => [unique("invoices_hash_uq").on(t.sha256), unique("invoices_charge_uq").on(t.chargeSessionId), index("invoices_upload_idx").on(t.uploadId)]);

export interface InvoiceCost { cost: string | null; currency: string | null; costSource: string | null }
