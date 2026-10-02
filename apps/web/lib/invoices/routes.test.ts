import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const state = vi.hoisted(() => ({ session: null as null | { username: string }, list: vi.fn() }));
vi.mock("../auth/session", () => ({ validateSession: async () => state.session }));
vi.mock("./archive", () => ({ listArchive: state.list, setArchiveEnabled: vi.fn(), importUpload: vi.fn(), reviewInvoice: vi.fn(), deleteUpload: vi.fn(), originalDownload: vi.fn(), monthlyExport: vi.fn() }));
import { DELETE, GET, PATCH, POST } from "../../app/api/invoices/[[...path]]/route";
beforeEach(() => { state.session = null; vi.clearAllMocks(); });
const context = (path: string[] = []) => ({ params: Promise.resolve({ path }) });
it("validates an actual session for every invoice handler, regardless of cookie presence", async () => {
  const request = new NextRequest("http://localhost/api/invoices", { headers: { cookie: "odovi_session=forged", "x-odovi-invoice": "1" } });
  for (const handler of [GET, POST, PATCH, DELETE]) expect((await handler(request, context())).status).toBe(401);
  expect(state.list).not.toHaveBeenCalled();
});
it("rejects cross-origin mutations and oversized bodies before importing", async () => {
  state.session = { username: "tester" };
  const crossOrigin = new NextRequest("http://localhost/api/invoices", { method: "POST", headers: { host: "localhost", origin: "http://other.invalid", "x-odovi-invoice": "1" } });
  expect((await POST(crossOrigin, context())).status).toBe(403);
  const huge = new NextRequest("http://localhost/api/invoices", { method: "POST", headers: { "x-odovi-invoice": "1", "content-length": "20971521" }, body: "x" });
  expect((await POST(huge, context())).status).toBe(413);
});
it("rejects invalid JSON and malformed IDs", async () => {
  state.session = { username: "tester" };
  const request = new NextRequest("http://localhost/api/invoices/settings", { method: "PATCH", headers: { "x-odovi-invoice": "1" }, body: "{" });
  expect((await PATCH(request, context(["settings"]))).status).toBe(400);
  expect((await GET(new NextRequest("http://localhost/api/invoices/invoice/NaN"), context(["invoice", "NaN"]))).status).toBe(400);
});
