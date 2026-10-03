import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { expect, test } from "@playwright/test";
import { installBrowserEgressGuard } from "../egress";
import { login } from "./helpers";
import { fixturePdf, fixtureZip } from "../../../apps/web/lib/invoices/fixtures.test-support";

for (const locale of ["en", "de"] as const) for (const theme of ["light", "dark"] as const) for (const width of [393, 1280]) {
  test(`invoice originals, review, export and deletion ${locale}/${theme}/${width}`, async ({ context, page }, testInfo) => {
    await installBrowserEgressGuard(context);
    await page.setViewportSize({ width, height: 900 });
    const origin = process.env.ODOVI_ACCEPTANCE_BASE_URL!;
    await context.addCookies([{ name: "odovi_locale", value: locale, url: origin }, { name: "odovi_theme", value: theme, url: origin }]);
    await login(page);
    expect((await page.request.patch("/api/invoices/settings", { data: { enabled: false }, headers: { "x-odovi-invoice": "1" } })).ok()).toBe(true);
    await page.goto("/settings");
    await page.getByRole("link", { name: /Tesla invoices|Tesla-Rechnungen/ }).click();
    await expect(page.getByRole("heading", { name: /Tesla invoice archive|Tesla-Rechnungsarchiv/ })).toBeVisible();
    const archive = page.getByRole("region", { name: /Tesla invoice archive|Tesla-Rechnungsarchiv/ });
    await expect(page.getByRole("link", { name: /^(More|Mehr)$/ })).toHaveAttribute("aria-current", "page");
    const enable = page.getByRole("checkbox", { name: /Enable invoice imports|Rechnungsimporte aktivieren/ });
    if (!await enable.isChecked()) { await enable.check(); await expect(archive.getByRole("status")).toHaveText(/Saved\.|Gespeichert\./); }
    const filename = `acceptance-${locale}-${theme}-${width}.pdf`;
    const original = fixturePdf(`Tesla Invoice number: ACCEPT-${locale}-${theme}-${width} Invoice date: 2026-09-01 Total amount: 12.34 EUR`);
    const digest = createHash("sha256").update(original).digest("hex");
    await page.locator('input[type="file"]').setInputFiles({ name: "invalid.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a PDF") });
    await expect(archive.getByRole("alert")).toHaveText(/invalid|ungültig/);
    await expect(archive.getByRole("alert")).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles({ name: filename, mimeType: "application/pdf", buffer: original });
    await expect(archive).toHaveAttribute("aria-busy", "true");
    await expect(archive.getByRole("status")).toHaveText(/Saved\.|Gespeichert\./);
    await expect(archive).toHaveAttribute("aria-busy", "false");
    await expect(archive.getByRole("alert")).toHaveCount(0);
    const section = page.locator("section").filter({ has: page.getByRole("link", { name: filename, exact: true }) });
    await expect(section).toBeVisible();
    await section.locator("summary").click();
    await expect(section.getByLabel(/Invoice number|Rechnungsnummer/)).toHaveValue(`ACCEPT-${locale}-${theme}-${width}`);
    await expect(section.getByLabel(/Total amount|Gesamtbetrag/)).toHaveValue("12.34");
    await section.getByLabel(/Total amount|Gesamtbetrag/).fill("1.005");
    await section.getByRole("button", { name: /Save reviewed|Geprüfte Angaben/ }).click();
    await expect(archive.getByRole("alert")).toHaveText(/Check the entered values|Angaben prüfen/);
    await expect(section.getByLabel(/Total amount|Gesamtbetrag/)).toHaveValue("1.005");
    await section.getByLabel(/Total amount|Gesamtbetrag/).fill("12,3");
    await section.getByRole("button", { name: /Save reviewed|Geprüfte Angaben/ }).click();
    await expect(archive.getByRole("status")).toHaveText(/Saved\.|Gespeichert\./);
    await expect(section.getByLabel(/Total amount|Gesamtbetrag/)).toHaveValue("12.30");
    await section.getByLabel(/Total amount|Gesamtbetrag/).fill("00012,30");
    await section.getByRole("button", { name: /Save reviewed|Geprüfte Angaben/ }).click();
    await expect(archive.getByRole("status")).toHaveText(/Saved\.|Gespeichert\./);
    await expect(section.getByLabel(/Total amount|Gesamtbetrag/)).toHaveValue("12.30");
    await expect(section.getByText(`SHA-256: ${digest}`, { exact: true })).toHaveCount(2);
    await section.getByLabel(/Invoice date|Rechnungsdatum/, { exact: true }).fill("2026-08-01");
    await section.getByRole("button", { name: /Save reviewed|Geprüfte Angaben/ }).click();
    await expect(archive.getByRole("status")).toHaveText(/Saved\.|Gespeichert\./);
    const pdfPromise = page.waitForEvent("download");
    await section.getByRole("link", { name: /Download original PDF|Original-PDF/ }).click();
    const downloaded = await pdfPromise;
    expect(createHash("sha256").update(await readFile((await downloaded.path())!)).digest("hex")).toBe(digest);
    await page.locator('input[type="month"]').fill("2026-08");
    const exportPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: /Download monthly evidence|Monatsbelege/ }).click();
    const exported = await exportPromise;
    expect(exported.suggestedFilename()).toBe("odovi-invoices-2026-08.zip");
    expect((await readFile((await exported.path())!)).subarray(0, 2).toString()).toBe("PK");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const button of await archive.getByRole("button").all()) {
      if (await button.isVisible()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.locator("html").evaluate((element) => element.classList.contains("dark"))).toBe(theme === "dark");
    await testInfo.attach("invoice-archive", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
    page.once("dialog", (dialog) => dialog.accept());
    await section.getByRole("button", { name: /Delete entire upload|Gesamten Upload löschen/ }).click();
    await expect(archive.getByRole("status")).toHaveText(/Upload deleted|Upload gelöscht/);
    await expect(section).toHaveCount(0);
  });
}

test("large invoice ZIP preserves every original and rejects chunked upload overflow", async ({ context, page }, testInfo) => {
  test.setTimeout(90_000);
  await installBrowserEgressGuard(context);
  await login(page);
  const origin = new URL(process.env.ODOVI_ACCEPTANCE_BASE_URL!).origin;
  const headers = { origin, "x-odovi-invoice": "1" };
  expect((await page.request.patch("/api/invoices/settings", { data: { enabled: true }, headers })).ok()).toBe(true);
  const index = async () => {
    const response = await page.request.get("/api/invoices");
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const before = await index();
  const mib = 1024 * 1024;
  const nonce = Date.now().toString(36).toUpperCase();
  const files: [string, Buffer][] = Array.from({ length: 4 }, (_, i) => {
    const pdf = fixturePdf(`Tesla Invoice number: BODY-${nonce}-${i} Total amount: 12.34 EUR`);
    const startxref = pdf.lastIndexOf("startxref\n");
    expect(startxref).toBeGreaterThan(0);
    // Comments before startxref preserve object/xref offsets and extracted text.
    const padding = Buffer.concat([Buffer.from("%"), Buffer.alloc(3 * mib - pdf.length - 2, 65 + i), Buffer.from("\n")]);
    return [`body-${i}.pdf`, Buffer.concat([pdf.subarray(0, startxref), padding, pdf.subarray(startxref)])];
  });
  const original = await fixtureZip(files, false);
  expect(original.length).toBeGreaterThan(10 * mib);
  expect(original.length).toBeLessThan(20 * mib);
  const digest = (data: Buffer) => createHash("sha256").update(data).digest("hex");
  let ownedUpload: number | null = null;
  try {
    const uploaded = await page.request.post("/api/invoices", {
      data: original,
      headers: { ...headers, "content-type": "application/zip", "x-invoice-filename": "acceptance-body-limit.zip" },
    });
    const result = await uploaded.json();
    if (uploaded.status() === 201) ownedUpload = result.uploadId;
    expect(uploaded.status(), JSON.stringify(result)).toBe(201);
    expect(result.duplicate).toBe(false);
    expect(Number.isSafeInteger(ownedUpload)).toBe(true);
    const stored = await index();
    const upload = stored.uploads.find((record: { id: number }) => record.id === ownedUpload);
    expect(upload).toMatchObject({ byteSize: original.length, sha256: digest(original) });
    const zipDownload = await page.request.get(`/api/invoices/upload/${ownedUpload}`);
    expect(zipDownload.status()).toBe(200);
    const zipBytes = await zipDownload.body();
    expect(zipBytes.length).toBe(original.length);
    expect(digest(zipBytes)).toBe(digest(original));
    const invoices = stored.invoices.filter((record: { uploadId: number }) => record.uploadId === ownedUpload);
    expect(invoices).toHaveLength(4);
    for (const [filename, pdf] of files) {
      const record = invoices.find((invoice: { filename: string }) => invoice.filename === filename);
      expect(record).toMatchObject({ byteSize: 3 * mib, sha256: digest(pdf) });
      const download = await page.request.get(`/api/invoices/invoice/${record.id}`);
      expect(download.status()).toBe(200);
      const bytes = await download.body();
      expect(bytes.length).toBe(3 * mib);
      expect(digest(bytes)).toBe(digest(pdf));
    }
    const cookie = (await context.cookies(origin)).map(({ name, value }) => `${name}=${value}`).join("; ");
    const rejected = await new Promise<{ status: number; body: Buffer }>((resolve, reject) => {
      const request = httpRequest(new URL("/api/invoices", origin), {
        method: "POST", headers: { ...headers, cookie, "content-type": "application/zip", "x-invoice-filename": "overflow.zip", "transfer-encoding": "chunked" },
      }, (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.once("error", reject);
        response.once("end", () => resolve({ status: response.statusCode!, body: Buffer.concat(chunks) }));
      });
      expect(request.getHeader("content-length")).toBeUndefined();
      request.once("error", reject);
      request.setTimeout(30_000, () => request.destroy(new Error("Chunked upload timed out")));
      request.write(Buffer.alloc(20 * mib, 32));
      request.end(Buffer.from("!"));
    });
    expect(rejected.status, rejected.body.toString()).toBe(413);
    expect(JSON.parse(rejected.body.toString())).toEqual({ error: "upload-too-large" });
    expect(await index()).toEqual(stored);
    await testInfo.attach("invoice-body-limit", { body: JSON.stringify({ zipBytes: original.length, pdfBytes: files.map(([, pdf]) => pdf.length), overflowBytes: 20 * mib + 1, overflowStatus: rejected.status }), contentType: "application/json" });
  } finally {
    if (ownedUpload !== null) expect((await page.request.delete(`/api/invoices/upload/${ownedUpload}`, { headers })).status()).toBe(200);
    expect(await index()).toEqual(before);
  }
});
