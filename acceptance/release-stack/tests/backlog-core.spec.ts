import { expect, test } from "@playwright/test";
import { login } from "./helpers";
import { installBrowserEgressGuard } from "../egress";

test.beforeEach(async ({ context }) => { await installBrowserEgressGuard(context); });

test("explicit result types, filter reset and contextual detail return", async ({ page }) => {
  await login(page);
  await page.goto("/search");
  await expect(page.getByTestId("search-summary")).toHaveCount(0);
  for (const type of ["charges", "drives", "all"]) {
    await page.goto(`/search?type=${type}`);
    await expect(page.getByTestId("search-summary")).toBeVisible();
    await expect(page.getByTestId("search-scope")).toBeVisible();
  }
  await page.goto("/search?type=invalid");
  await expect(page.getByTestId("search-summary")).toHaveCount(0);
  await page.goto("/search?q=never-matches-odovi-fixture&type=all&from=2026-01-01&classification=business");
  await expect(page.getByText(/No results found|Keine Ergebnisse/i)).toBeVisible();
  await page.getByRole("button", { name: /Reset to all drives|Zurücksetzen auf alle Fahrten/ }).click();
  await expect(page).toHaveURL(/\/search\?type=drives$/);
  await expect(page.getByTestId("search-summary")).toBeVisible();

  const row = page.locator('a[id^="drive-"]').nth(3);
  const rowId = await row.getAttribute("id");
  await row.click();
  await expect(page).toHaveURL(/\/drives\/\d+\?returnTo=/);
  await page.reload();
  await page.getByRole("link", { name: /^(Back|Zurück)$/ }).click();
  await expect(page).toHaveURL(new RegExp(`/search\\?type=drives#${rowId}$`));
  await expect(page.locator(`#${rowId}`)).toBeFocused();

  await page.goto(`/day/${process.env.ODOVI_ACCEPTANCE_DAY}?vehicle=1&month=2026-09`);
  const dayRow = page.locator('a[id^="drive-"]').first();
  await dayRow.click();
  await page.getByRole("link", { name: /^(Back|Zurück)$/ }).click();
  await expect(page).toHaveURL(/vehicle=1&month=2026-09#drive-/);
  await page.getByRole("link", { name: /Open calendar|Kalender öffnen/i }).click();
  await expect(page).toHaveURL(/\/calendar\?month=2026-09&vehicle=1/);
});

for (const locale of ["en", "de"]) for (const theme of ["light", "dark"]) for (const width of [320, 393, 1440]) {
  test(`archive reference ${locale} ${theme} ${width}px`, async ({ page, context }, testInfo) => {
    test.setTimeout(90_000);
    await context.addCookies([
      { name: "odovi_locale", value: locale, url: process.env.ODOVI_ACCEPTANCE_BASE_URL! },
      { name: "odovi_theme", value: theme, url: process.env.ODOVI_ACCEPTANCE_BASE_URL! },
    ]);
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 852 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await login(page);
    const classify = page.getByRole("link", { name: /Classify now|Jetzt klassifizieren/i });
    await expect(classify).toBeVisible();
    const box = await classify.boundingBox();
    expect(box!.y + box!.height).toBeLessThan(780);
    for (const path of ["/", `/day/${process.env.ODOVI_ACCEPTANCE_DAY}`, "/search?type=all"]) {
      await page.goto(path);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (path.startsWith("/day/")) {
        await expect(page.getByTestId("day-totals")).toBeVisible();
        await expect(page.locator('a[id^="drive-"]').first()).toBeVisible();
        const summary = await page.getByTestId("day-totals").boundingBox();
        const firstRow = await page.locator('a[id^="drive-"]').first().boundingBox();
        expect(summary!.y).toBeLessThan(firstRow!.y);
      }
      await page.screenshot({ path: testInfo.outputPath(`${path.replace(/[^a-z0-9]/gi, "_") || "home"}.png`), fullPage: true });
    }
    await page.locator('a[id^="drive-"]').first().click();
    await expect(page.locator('textarea[name="notes"]')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("drive.png"), fullPage: true });
    if (width === 393) {
      await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });
}
