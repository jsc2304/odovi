import { fork } from "node:child_process";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { InvoiceMetadata } from "@odovi/db";

export const INVOICE_LIMITS = { uploadBytes: 20 * 1024 * 1024, archiveBytes: 1024 * 1024 * 1024, exportBytes: 100 * 1024 * 1024 };
export class InvoiceError extends Error { constructor(message: string, public status = 400) { super(message); } }
export const hash = (data: Buffer) => createHash("sha256").update(data).digest("hex");
export const filenameSchema = z.string().min(1).max(240).regex(/^[^\x00-\x1f\x7f/\\]+\.(pdf|zip)$/i);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s);
export const metadataSchema = z.object({
  invoiceNumber: z.string().trim().min(1).max(100).nullable(), invoiceDate: date.nullable(),
  vin: z.string().regex(/^[A-HJ-NPR-Z0-9]{17}$/).nullable(),
  chargingStart: z.string().datetime({ offset: true }).nullable(),
  energyKwh: z.number().finite().positive().max(1000).nullable(),
  total: z.string().regex(/^\d{1,8}\.\d{2}$/).transform((value) => Number(value).toFixed(2)).nullable(), currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
}).strict().refine((v) => v.total == null || v.currency != null, "Amount requires currency");

export function parseMetadata(text: string): InvoiceMetadata {
  const empty: InvoiceMetadata = { invoiceNumber: null, invoiceDate: null, vin: null, chargingStart: null, energyKwh: null, total: null, currency: null };
  if (!/\btesla\b/i.test(text)) return empty;
  const value = (pattern: RegExp) => text.match(pattern)?.[1]?.trim() ?? null;
  const invoiceNumber = value(/(?:invoice\s*(?:number|no\.?)|rechnungsnummer)\s*:?\s*([A-Z0-9-]{3,100})/i);
  const rawDate = value(/(?:invoice\s*date|rechnungsdatum)\s*:?\s*(\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4})/i);
  const candidateDate = rawDate?.includes(".") ? rawDate.split(".").reverse().join("-") : rawDate;
  const invoiceDate = date.safeParse(candidateDate).success ? candidateDate! : null;
  const vin = value(/\bVIN\s*:?\s*([A-HJ-NPR-Z0-9]{17})\b/i)?.toUpperCase() ?? null;
  const rawStart = value(/(?:charging\s*start|ladebeginn)\s*:?\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2}))/i);
  const chargingStart = rawStart && z.string().datetime({ offset: true }).safeParse(rawStart).success ? new Date(rawStart).toISOString() : null;
  const rawEnergy = value(/(?:energy\s*(?:delivered|added)|geladene\s*energie)\s*:?\s*(\d+(?:[.,]\d+)?)\s*kWh\b/i);
  const energy = rawEnergy ? Number(rawEnergy.replace(",", ".")) : null;
  const energyKwh = energy && energy > 0 && energy <= 1000 ? energy : null;
  const amounts = Array.from(text.matchAll(/\b(?:total\s*(?:amount)?|gesamtbetrag)\s*:?\s*(?:(EUR|CHF|GBP|USD)\s*)?(\d{1,8}[.,]\d{2})\s*(EUR|CHF|GBP|USD)?\b/ig));
  const amount = amounts.length === 1 ? amounts[0] : null;
  const currency = amount && (!amount[1] || !amount[3] || amount[1].toUpperCase() === amount[3].toUpperCase()) ? (amount[1] ?? amount[3])?.toUpperCase() ?? null : null;
  const total = currency && amount ? Number(amount[2]!.replace(",", ".")).toFixed(2) : null;
  return { invoiceNumber, invoiceDate, vin, chargingStart, energyKwh, total, currency };
}

export interface ParsedPdf { filename: string; original: Buffer; text: string }
// ponytail: one parser per web process; use a dedicated queue if import throughput matters.
let parsing = false;
export async function parseUpload(data: Buffer, filename: string): Promise<ParsedPdf[]> {
  if (parsing) throw new InvoiceError("parser-busy", 429);
  if (!filenameSchema.safeParse(filename).success || !data.length || data.length > INVOICE_LIMITS.uploadBytes) throw new InvoiceError("invalid-upload");
  parsing = true;
  try {
    // Real deferred imports let Next trace the parsers' transitive dependencies.
    // Parsing still runs only in the isolated child below.
    const [zip, pdf] = await Promise.all([import("yauzl"), import("pdfjs-dist/legacy/build/pdf.mjs")]);
    if (typeof zip.fromBuffer !== "function" || !pdf.version) throw new InvoiceError("parser-unavailable", 503);
    return await new Promise((resolve, reject) => {
      // process-check runs in Node >=22.15 (the supported Node 22 Docker image).
      const child = fork(path.join(process.cwd(), "lib/invoices/extract.mjs"), [], {
        execArgv: ["--max-old-space-size=192"], env: { NODE_ENV: "production" },
        serialization: "advanced", stdio: ["ignore", "ignore", "ignore", "ipc"],
      });
      const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new InvoiceError("parser-timeout", 422)); }, 15_000);
      child.once("message", (message: { files?: ParsedPdf[]; error?: string }) => {
        if (message.files) resolve(message.files); else reject(new InvoiceError("invalid-upload", 422));
        child.kill();
      });
      child.once("error", () => reject(new InvoiceError("parser-unavailable", 503)));
      child.once("exit", () => { clearTimeout(timer); reject(new InvoiceError("invalid-upload", 422)); });
      child.send({ data, filename });
    });
  } finally { parsing = false; }
}

export interface ChargeCandidate { id: number; vin: string | null; startTime: Date; energyAddedKwh: number | null }
export function matchCandidates(metadata: InvoiceMetadata, charges: ChargeCandidate[]) {
  const candidates = charges.filter((c) => (!metadata.vin || c.vin === metadata.vin) &&
    (!metadata.chargingStart || Math.abs(c.startTime.getTime() - Date.parse(metadata.chargingStart)) <= 10 * 60_000) &&
    (metadata.energyKwh == null || (c.energyAddedKwh != null && Math.abs(c.energyAddedKwh - metadata.energyKwh) <= 1)));
  const exact = metadata.vin && metadata.chargingStart && metadata.energyKwh != null && candidates.length === 1 &&
    Math.abs(candidates[0]!.startTime.getTime() - Date.parse(metadata.chargingStart)) <= 2 * 60_000 &&
    Math.abs(candidates[0]!.energyAddedKwh! - metadata.energyKwh) <= 0.2;
  return { status: exact ? "matched" : candidates.length ? "probable" : "unmatched", candidates } as const;
}
