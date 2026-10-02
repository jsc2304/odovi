import { expect, test, type Page } from "@playwright/test";
import { installBrowserEgressGuard } from "../egress";
import { login } from "./helpers";

const day = process.env.ODOVI_ACCEPTANCE_DAY;
const month = day?.slice(0, 7);
const year = process.env.ODOVI_ACCEPTANCE_INSIGHTS_YEAR ?? day?.slice(0, 4);

async function fitsViewport(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}

for (const locale of ["en", "de"] as const) {
  for (const theme of ["light", "dark"] as const) {
    for (const width of [320, 393, 1280]) {
      test(`calendar summaries and modal keyboard path: ${locale}, ${theme}, ${width}px`, async ({ page, context }) => {
        test.skip(!day, "The runner must provide a synthetic fixture day.");
        await installBrowserEgressGuard(context);
        await context.addCookies([
          { name: "odovi_locale", value: locale, url: process.env.ODOVI_ACCEPTANCE_BASE_URL! },
          { name: "odovi_theme", value: theme, url: process.env.ODOVI_ACCEPTANCE_BASE_URL! },
        ]);
        await page.setViewportSize({ width, height: 900 });
        await login(page);
        await page.goto(`/calendar?month=${month}`);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await fitsViewport(page);
        await expect(page.locator(`[data-date="${day}"]`)).toBeVisible();
        const cells = page.getByTestId("calendar-day-cell");
        for (const cell of await cells.all()) {
          const box = await cell.boundingBox();
          // Calendar cells meet the AA 24px baseline; primary actions below target 44px.
          expect(box!.width).toBeGreaterThanOrEqual(24);
          expect(box!.height).toBeGreaterThanOrEqual(44);
        }
        const metricGroup = page.getByRole("group", { name: locale === "en" ? "Calendar metric" : "Kalender-Kennzahl" });
        const metricNames = locale === "en" ? ["Distance", "Consumption", "Energy", "Trips"] : ["Distanz", "Verbrauch", "Energie", "Fahrten"];
        for (const name of metricNames) {
          const metric = metricGroup.getByRole("button", { name, exact: true });
          const box = await metric.boundingBox();
          expect(box!.width).toBeGreaterThanOrEqual(44);
          expect(box!.height).toBeGreaterThanOrEqual(44);
          await metric.click();
          await expect(metric).toHaveAttribute("aria-pressed", "true");
          const trigger = page.locator(`[data-date="${day}"]`);
          await trigger.focus();
          await page.keyboard.press("Enter");
          const dialog = page.getByRole("dialog");
          await expect(dialog).toBeVisible();
          await expect(dialog.locator("dl dt")).toHaveCount(5);
          await expect(dialog.locator("dl")).toContainText(name);
          const close = dialog.getByRole("button", { name: /Close drive preview|Fahrtenvorschau schließen/ });
          await expect(close).toBeFocused();
          const closeBox = await close.boundingBox();
          expect(closeBox!.width).toBeGreaterThanOrEqual(44);
          expect(closeBox!.height).toBeGreaterThanOrEqual(44);
          const fullDay = dialog.getByRole("link", { name: /Open full day|Ganzen Tag öffnen/, exact: true });
          await expect(fullDay).toHaveAttribute("href", new RegExp(`/day/${day}\\?.*month=${month}`));
          await fullDay.focus();
          await page.keyboard.press("Tab");
          await expect(close).toBeFocused();
          await page.keyboard.press("Shift+Tab");
          await expect(fullDay).toBeFocused();
          await page.keyboard.press("Escape");
          await expect(dialog).toHaveCount(0);
          await expect(trigger).toBeFocused();
          await expect(page).toHaveURL(new RegExp(`/calendar\\?month=${month}$`));
        }
        await page.reload();
        await expect(metricGroup.getByRole("button").last()).toHaveAttribute("aria-pressed", "true");
        // Text enlargement, rather than a compositor scale, exercises real layout reflow.
        await page.addStyleTag({ content: "html { font-size: 200%; }" });
        await fitsViewport(page);
        const trigger = page.locator(`[data-date="${day}"]`);
        await trigger.click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(trigger).toBeFocused();

        await page.goto("/calendar?month=2099-06");
        await page.locator('[data-date="2099-06-10"]').click();
        await expect(page.getByRole("dialog")).toContainText(locale === "en" ? "No recorded drives on this day." : "Keine aufgezeichneten Fahrten an diesem Tag.");
        await page.keyboard.press("Escape");
        await expect(page.locator('[data-date="2099-06-10"]')).toBeFocused();
        await expect(page).toHaveURL(/month=2099-06$/);
      });
    }

    test(`chart data views match their filtered scopes: ${locale}, ${theme}`, async ({ page, context }) => {
      test.skip(!day, "The runner must provide synthetic analytics data, including 30 usable Insights drives.");
      await installBrowserEgressGuard(context);
      await context.addCookies([
        { name: "odovi_locale", value: locale, url: process.env.ODOVI_ACCEPTANCE_BASE_URL! },
        { name: "odovi_theme", value: theme, url: process.env.ODOVI_ACCEPTANCE_BASE_URL! },
      ]);
      await page.setViewportSize({ width: 320, height: 900 });
      await login(page);
      await page.goto("/insights");
      const dataViews = page.locator("[data-chart-data]");
      await expect.poll(() => dataViews.count()).toBeGreaterThanOrEqual(4);
      for (const view of await dataViews.all()) {
        await view.locator("summary").press("Enter");
        await expect(view.getByRole("table")).toBeVisible();
        await expect.poll(() => view.locator("tbody tr").count()).toBeGreaterThan(0);
        await view.getByRole("region").focus();
        await expect(view.getByRole("region")).toBeFocused();
      }
      await fitsViewport(page);

      await page.goto("/charges/analysis?count=10");
      await expect(page.getByRole("img", { name: /Charging power by state of charge|Ladeleistung nach Ladestand/ })).toBeVisible();
      const curves = page.locator("details").filter({ has: page.locator("summary", { hasText: /Recorded curve values|Erfasste Kurvenwerte/ }) });
      await expect.poll(() => curves.count()).toBeGreaterThan(0);
      const first = curves.first();
      await first.locator("summary").press("Enter");
      // The synthetic charging fixture has 36 plotted samples; all remain accessible.
      await expect(first.locator("tbody tr")).toHaveCount(36);
      await expect(first.getByRole("table")).toContainText(locale === "en" ? "Segment" : "Abschnitt");
      await fitsViewport(page);

      await page.goto(`/wrapped?year=${year}&classification=private`);
      const destinationData = page.locator("[data-destination-data]");
      await destinationData.locator("summary").press("Enter");
      await expect(destinationData.getByRole("table")).toBeVisible();
      await expect(destinationData.getByRole("table")).toContainText(year!);
      await expect(destinationData.getByRole("table")).toContainText(locale === "en" ? "Private" : "Privat");
      await expect.poll(() => destinationData.locator("tbody tr").count()).toBeGreaterThan(0);
      await fitsViewport(page);
      await page.getByRole("combobox", { name: locale === "en" ? "Drive classification" : "Fahrtklassifikation" }).selectOption("business");
      await page.getByRole("button", { name: /Apply filters|Filter anwenden/ }).click();
      await expect(page).toHaveURL(/classification=business/);
      await destinationData.locator("summary").click();
      await expect(destinationData.getByRole("table")).toContainText(locale === "en" ? "Business" : "Geschäftlich");
      await page.getByRole("combobox", { name: locale === "en" ? "Drive classification" : "Fahrtklassifikation" }).selectOption("commute");
      await page.getByRole("button", { name: /Apply filters|Filter anwenden/ }).click();
      await destinationData.locator("summary").click();
      await expect(destinationData.locator("tbody tr")).toHaveCount(12);
    });
  }
}
