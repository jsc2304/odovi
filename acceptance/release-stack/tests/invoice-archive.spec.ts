import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { installBrowserEgressGuard } from "../egress";
import { login } from "./helpers";
import { fixturePdf } from "../../../apps/web/lib/invoices/fixtures.test-support";

for (const locale of ["en", "de"] as const) for (const theme of ["light", "dark"] as const) for (const width of [393, 1280]) {
  test(`invoice originals, review, export and deletion ${locale}/${theme}/${width}`, async ({ context, page }, testInfo) => {
    await installBrowserEgressGuard(context);
    await page.setViewportSize({ width, height: 900 });
    const origin = process.env.ODOVI_ACCEPTANCE_BASE_URL!;
    await context.addCookies([{ name: "odovi_locale", value: locale, url: origin }, { name: "odovi_theme", value: theme, url: origin }]);
    await login(page);
    await page.goto("/settings");
    await page.getByRole("link", { name: /Tesla invoices|Tesla-Rechnungen/ }).click();
    await expect(page.getByRole("heading", { name: /Tesla invoice archive|Tesla-Rechnungsarchiv/ })).toBeVisible();
    const enable = page.getByRole("checkbox", { name: /Enable invoice imports|Rechnungsimporte aktivieren/ });
    if (!await enable.isChecked()) { await enable.check(); await expect(page.getByRole("status")).toHaveText(/Saved\.|Gespeichert\./); }
    const filename = `acceptance-${locale}-${theme}-${width}.pdf`;
    const original = fixturePdf(`Tesla Invoice number: ACCEPT-${locale}-${theme}-${width} Invoice date: 2026-09-01 Total amount: 12.34 EUR`);
    const digest = createHash("sha256").update(original).digest("hex");
    await page.locator('input[type="file"]').setInputFiles({ name: filename, mimeType: "application/pdf", buffer: original });
    await expect(page.getByRole("status")).toHaveText(/Saved\.|Gespeichert\./);
    const section = page.locator("section").filter({ has: page.getByRole("link", { name: filename, exact: true }) });
    await expect(section).toBeVisible();
    await section.locator("summary").click();
    await expect(section.getByLabel(/Invoice number|Rechnungsnummer/)).toHaveValue(`ACCEPT-${locale}-${theme}-${width}`);
    await expect(section.getByLabel(/Total amount|Gesamtbetrag/)).toHaveValue("12.34");
    await expect(section.getByText(`SHA-256: ${digest}`, { exact: true })).toHaveCount(2);
    await section.getByLabel(/Invoice date|Rechnungsdatum/, { exact: true }).fill("2026-08-01");
    await section.getByRole("button", { name: /Save reviewed|Geprüfte Angaben/ }).click();
    await expect(page.getByRole("status")).toHaveText(/Saved\.|Gespeichert\./);
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
    expect(await page.locator("html").evaluate((element) => element.classList.contains("dark"))).toBe(theme === "dark");
    await testInfo.attach("invoice-archive", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
    page.once("dialog", (dialog) => dialog.accept());
    await section.getByRole("button", { name: /Delete entire upload|Gesamten Upload löschen/ }).click();
    await expect(page.getByRole("status")).toHaveText(/Upload deleted|Upload gelöscht/);
    await expect(section).toHaveCount(0);
  });
}
