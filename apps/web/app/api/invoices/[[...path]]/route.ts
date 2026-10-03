import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession } from "../../../../lib/auth/session";
import { deleteUpload, importUpload, listArchive, monthlyExport, originalDownload, reviewInvoice, setArchiveEnabled } from "../../../../lib/invoices/archive";
import { INVOICE_LIMITS, InvoiceError, metadataSchema } from "../../../../lib/invoices/processing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ path?: string[] }> };
const id = (raw: string | undefined) => {
  if (!raw || !/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new InvoiceError("invalid-id");
  return Number(raw);
};
const errorResponse = (error: unknown) => NextResponse.json({ error: error instanceof InvoiceError ? error.message : error instanceof z.ZodError ? "invalid-input" : "archive-unavailable" },
  { status: error instanceof InvoiceError ? error.status : error instanceof z.ZodError || error instanceof SyntaxError || error instanceof URIError ? 400 : 503, headers: { "Cache-Control": "private, no-store" } });

async function body(request: NextRequest, max: number) {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > max)) throw new InvoiceError("upload-too-large", 413);
  if (!request.body) throw new InvoiceError("empty-body");
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; void reader.cancel(); }, 15_000);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) { await reader.cancel(); throw new InvoiceError("upload-too-large", 413); }
      chunks.push(Buffer.from(value));
    }
  } finally { clearTimeout(timer); reader.releaseLock(); }
  if (timedOut) throw new InvoiceError("incomplete-body", 408);
  if (length && size !== Number(length)) throw new InvoiceError("incomplete-body");
  return Buffer.concat(chunks);
}

function mutationGuard(request: NextRequest) {
  // A custom header requires a CORS preflight; cross-origin mutations also fail.
  // https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS#preflighted_requests
  if (request.headers.get("x-odovi-invoice") !== "1") throw new InvoiceError("invalid-origin", 403);
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) throw new InvoiceError("invalid-origin", 403);
}
function download(data: Buffer, filename: string, type: string) {
  return new NextResponse(new Uint8Array(data), { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function GET(request: NextRequest, context: Context) {
  if (!await validateSession()) return NextResponse.json({ error: "not-authenticated" }, { status: 401 });
  try {
    const { path = [] } = await context.params;
    if (!path.length) return NextResponse.json(await listArchive(), { headers: { "Cache-Control": "private, no-store" } });
    if (path.length === 1 && path[0] === "export") {
      const month = request.nextUrl.searchParams.get("month") ?? "";
      return download(await monthlyExport(month), `odovi-invoices-${month}.zip`, "application/zip");
    }
    if (path.length === 2 && (path[0] === "invoice" || path[0] === "upload")) {
      const record = await originalDownload(path[0], id(path[1]));
      return download(record.original, record.filename.split("/").at(-1)!, /\.pdf$/i.test(record.filename) ? "application/pdf" : "application/zip");
    }
    throw new InvoiceError("not-found", 404);
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: NextRequest, context: Context) {
  const user = await validateSession();
  if (!user) return NextResponse.json({ error: "not-authenticated" }, { status: 401 });
  try {
    mutationGuard(request);
    if ((await context.params).path?.length) throw new InvoiceError("not-found", 404);
    const filename = decodeURIComponent(request.headers.get("x-invoice-filename") ?? "");
    const result = await importUpload(await body(request, INVOICE_LIMITS.uploadBytes), filename, user.username);
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: NextRequest, context: Context) {
  const user = await validateSession();
  if (!user) return NextResponse.json({ error: "not-authenticated" }, { status: 401 });
  try {
    mutationGuard(request);
    const { path = [] } = await context.params;
    const input = JSON.parse((await body(request, 64 * 1024)).toString("utf8"));
    if (path.length === 1 && path[0] === "settings") {
      const { enabled } = z.object({ enabled: z.boolean() }).strict().parse(input);
      await setArchiveEnabled(enabled, user.username);
    } else if (path.length === 2 && path[0] === "invoice") {
      const parsed = z.object({ metadata: metadataSchema, chargeSessionId: z.number().int().positive().nullable(), enrich: z.boolean() }).strict().parse(input);
      await reviewInvoice(id(path[1]), parsed.metadata, parsed.chargeSessionId, parsed.enrich, user.username);
    } else throw new InvoiceError("not-found", 404);
    return NextResponse.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: NextRequest, context: Context) {
  const user = await validateSession();
  if (!user) return NextResponse.json({ error: "not-authenticated" }, { status: 401 });
  try {
    mutationGuard(request);
    const { path = [] } = await context.params;
    if (path.length !== 2 || path[0] !== "upload") throw new InvoiceError("not-found", 404);
    return NextResponse.json(await deleteUpload(id(path[1]), user.username));
  } catch (error) { return errorResponse(error); }
}
