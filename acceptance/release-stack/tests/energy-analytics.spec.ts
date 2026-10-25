import { expect, test } from "@playwright/test";
import { installBrowserEgressGuard } from "../egress";
import { login } from "./helpers";

const vehicle = process.env.ODOVI_ACCEPTANCE_ENERGY_VEHICLE;
const emptyVehicle = process.env.ODOVI_ACCEPTANCE_ENERGY_EMPTY_VEHICLE;
const month = process.env.ODOVI_ACCEPTANCE_ENERGY_MONTH;

for (const locale of ["en", "de"] as const) {
  for (const theme of ["light", "dark"] as const) {
    for (const width of [320, 1280]) {
      test(`energy history, economics and charge boundary: ${locale}, ${theme}, ${width}px`, async ({ page, context }, testInfo) => {
        test.skip(!vehicle || !emptyVehicle || !month, "The runner must provide the disposable energy fixture.");
        await installBrowserEgressGuard(context);
        await context.addCookies([
          { name: "odovi_locale", value: locale, url: process.env.ODOVI_ACCEPTANCE_BASE_URL! },
          { name: "odovi_theme", value: theme, url: process.env.ODOVI_ACCEPTANCE_BASE_URL! },
        ]);
        await page.setViewportSize({ width, height: 900 });
        await login(page);
        const since = page.getByRole("region", { name: locale === "en" ? "Since last charge" : "Seit der letzten Ladung" });
        await expect(since).toBeVisible();
        await expect(since).toContainText(locale === "en" ? "30.0 km" : "30,0 km");
        await expect(since).toContainText(locale === "en" ? "6.0 kWh" : "6,0 kWh");
        await expect(since).toContainText(locale === "en" ? "Driving energy includes estimates." : "Fahrenergie enthält Schätzwerte.");
        await expect(since).toContainText(locale === "en" ? "1 drive crossing" : "1 Fahrt über die Ladegrenze");
        await page.goto(`/battery?vehicle=${vehicle}`);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(locale === "en" ? "Battery range history" : "Batterie-Reichweitenverlauf");
        const table = page.getByRole("table");
        await expect(table.getByRole("row")).toHaveCount(3);
        await expect(table).toContainText("500 km");
        await expect(table).toContainText("490 km");
        await expect(page.getByRole("img")).toBeVisible();
        await expect(page.locator("main")).toContainText("-10 km");
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
        await page.screenshot({ path: testInfo.outputPath("battery.png"), fullPage: true });
        const method = page.locator("main details summary");
        await method.focus();
        await page.keyboard.press("Space");
        await expect(page.locator("main details")).toHaveAttribute("open", "");
        await page.getByLabel(locale === "en" ? "Vehicle" : "Fahrzeug", { exact: true }).selectOption(emptyVehicle!);
        await page.getByRole("button", { name: locale === "en" ? "Show vehicle" : "Fahrzeug anzeigen" }).click();
        await expect(page).toHaveURL(new RegExp(`vehicle=${emptyVehicle}`));
        await expect(page.getByRole("table").getByRole("row")).toHaveCount(1);

        await page.goto(`/charges/economics?vehicle=${vehicle}&month=${month}`);
        const totals = page.getByRole("region", { name: locale === "en" ? "Monthly charging totals" : "Ladesummen des Monats" });
        await expect(totals).toContainText("160 kWh");
        await expect(totals).toContainText("144 kWh");
        await expect(totals).toContainText(locale === "en" ? "92.7 %" : "92,7 %");
        await expect(totals).toContainText("9 kWh");
        await expect(totals).toContainText("EUR");
        await expect(totals).toContainText("USD");
        await expect(totals).toContainText(locale === "en" ? "Unknown currency" : "Unbekannte Währung");
        await expect(page.getByRole("heading", { name: locale === "en" ? "By location" : "Nach Ladeort", exact: true })).toBeVisible();
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
        await page.screenshot({ path: testInfo.outputPath("economics.png"), fullPage: true });
        await page.getByLabel(locale === "en" ? "Month" : "Monat", { exact: true }).fill("2099-06");
        await page.getByRole("button", { name: locale === "en" ? "Apply filters" : "Filter anwenden" }).click();
        await expect(page).toHaveURL(new RegExp(`vehicle=${vehicle}.*month=2099-06`));
        await expect(page.getByRole("region", { name: locale === "en" ? "Monthly charging totals" : "Ladesummen des Monats" })).toContainText(locale === "en" ? "No completed charging sessions" : "Keine abgeschlossenen Ladevorgänge");
      });
    }
  }
}
