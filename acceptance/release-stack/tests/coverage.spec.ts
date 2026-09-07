import { expect, test } from "@playwright/test";
import { installBrowserEgressGuard } from "../egress";
import { login, noteDeferredContract } from "./helpers";

test.beforeEach(async ({ context }) => {
  await installBrowserEgressGuard(context);
});

test("core archive remains usable while external providers are denied", async ({ page }, testInfo) => {
  await login(page);
  await page.goto(`/day/${process.env.ODOVI_ACCEPTANCE_DAY}`);
  await expect(page.locator("[data-testid=day-totals]")).toBeVisible();
  await expect(page.locator("[data-drive-classification]").first()).toBeVisible();

  if (process.env.ODOVI_EXPECT_PROVIDER_DISABLED_UI === "1") {
    await expect(page.locator("[data-testid=provider-disabled]").first()).toBeVisible();
  } else {
    noteDeferredContract(
      testInfo,
      "#32",
      "Network denial and core fallback are covered; Provider Review and the explicit disabled state follow in #32.",
    );
  }

  if (process.env.ODOVI_EXPECT_MAP_PROVIDER_POLICY !== "1") {
    noteDeferredContract(
      testInfo,
      "#33",
      "Map-specific disabled fallbacks and click-only external navigation remain bounded to #33.",
    );
  }
});

test("provider activation uses direct, touch-sized controls", async ({ page }) => {
  await login(page);
  await page.goto("/settings#provider-review");

  const card = page.locator("#provider-review article").first();
  await expect(card).toBeVisible();
  await expect(card.locator("select")).toHaveCount(0);

  const checkbox = card.getByRole("checkbox");
  const activationControl = card.getByTestId("provider-activation-control");
  const activationBox = await activationControl.boundingBox();
  expect(activationBox?.height).toBeGreaterThanOrEqual(44);

  await checkbox.check();
  const providerChoices = card.getByTestId("provider-choice");
  await expect(providerChoices).toHaveCount(2);
  for (const choice of await providerChoices.all()) {
    const choiceBox = await choice.boundingBox();
    expect(choiceBox?.height).toBeGreaterThanOrEqual(44);
  }

  await card.getByRole("radio", { name: /own provider|eigenen anbieter/i }).check();
  await expect(card.getByRole("textbox", { name: /provider name|anbietername/i })).toBeVisible();

  await checkbox.uncheck();
  await expect(providerChoices).toHaveCount(0);
});

test("manual language selection persists", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    /trip logbook/i,
  );
  await expect.poll(async () => {
    const response = await page.request.get("/manifest.webmanifest");
    return (await response.json()) as { description?: string; lang?: string };
  }).toMatchObject({ description: expect.stringMatching(/trip logbook/i), lang: "en" });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByRole("button", { name: "DE", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    /Fahrtenarchiv/i,
  );
  await expect.poll(async () => {
    const response = await page.request.get("/manifest.webmanifest");
    return (await response.json()) as { description?: string; lang?: string };
  }).toMatchObject({ description: expect.stringMatching(/Fahrtenarchiv/i), lang: "de" });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
});

test("browser language selects German and otherwise falls back to English", async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one exact negotiation run is sufficient");

  if (process.env.ODOVI_EXPECT_BROWSER_LOCALE !== "1") {
    noteDeferredContract(
      testInfo,
      "#29",
      "Manual persistence is covered; browser-language detection and English fallback follow in #29.",
    );
    return;
  }

  for (const { browserLocale, expected } of [
    { browserLocale: "de-DE", expected: "de" },
    { browserLocale: "fr-FR", expected: "en" },
  ]) {
    const context = await browser.newContext({
      baseURL: process.env.ODOVI_ACCEPTANCE_BASE_URL,
      locale: browserLocale,
    });
    await installBrowserEgressGuard(context);
    const freshPage = await context.newPage();
    await freshPage.goto("/login");
    await expect(freshPage.locator("html")).toHaveAttribute("lang", expected);

    if (browserLocale === "de-DE") {
      await freshPage.getByRole("button", { name: "EN", exact: true }).click();
      await expect(freshPage.locator("html")).toHaveAttribute("lang", "en");
      await freshPage.reload();
      await expect(freshPage.locator("html")).toHaveAttribute("lang", "en");
    }

    await context.close();
  }
});

test("200 percent page scale keeps primary controls operable", async ({ page }) => {
  await login(page);
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  await page.goto(`/day/${process.env.ODOVI_ACCEPTANCE_DAY}`);
  const firstClassification = page.locator("[data-drive-classification]").first();
  await expect(firstClassification).toBeVisible();
  await firstClassification.getByRole("button").first().focus();
  await expect(firstClassification.getByRole("button").first()).toBeFocused();
});

test("viewport permits user zoom", async ({ page }) => {
  await page.goto("/login");
  const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
  expect(viewport).not.toMatch(/user-scalable\s*=\s*no/i);
  expect(viewport).not.toMatch(/maximum-scale\s*=\s*1/i);
});

test("DC charging analysis requires sign-in", async ({ page }) => {
  await page.goto("/charges/analysis");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel(/Password|Passwort/i).first()).toBeVisible();
});

for (const copy of [
  {
    locale: "en",
    languageButton: "EN",
    entry: "Compare DC charging",
    title: "DC charging analysis",
    countNavigation: "Number of sessions",
    five: "Last 5",
    ten: "Last 10",
    chart: "Charging power by state of charge",
    details: "Session details",
    samples: "Recorded curve values",
  },
  {
    locale: "de",
    languageButton: "DE",
    entry: "DC-Ladungen vergleichen",
    title: "DC-Ladeanalyse",
    countNavigation: "Anzahl der Ladevorgänge",
    five: "Letzte 5",
    ten: "Letzte 10",
    chart: "Ladeleistung nach Ladestand",
    details: "Details der Ladevorgänge",
    samples: "Erfasste Kurvenwerte",
  },
]) {
  test(`DC charging analysis is usable in ${copy.locale} and preserves the selected count`, async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: copy.languageButton, exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", copy.locale);
    await login(page);
    await page.goto("/charges");
    await page.getByRole("link", { name: copy.entry, exact: true }).click();

    await expect(page).toHaveURL(/\/charges\/analysis$/);
    await expect(page.getByRole("heading", { name: copy.title, level: 1 })).toBeVisible();
    const countNavigation = page.getByRole("navigation", { name: copy.countNavigation });
    const five = countNavigation.getByRole("link", { name: copy.five, exact: true });
    const ten = countNavigation.getByRole("link", { name: copy.ten, exact: true });
    await expect(five).toHaveAttribute("aria-current", "page");
    await ten.click();
    await expect(page).toHaveURL(/\/charges\/analysis\?count=10$/);
    await expect(ten).toHaveAttribute("aria-current", "page");
    await expect(five).not.toHaveAttribute("aria-current", "page");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", copy.locale);
    await expect(ten).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("img", { name: copy.chart, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: copy.details, level: 2 })).toBeVisible();
    const sessionLink = page.getByRole("heading", { level: 3 }).getByRole("link").first();
    await expect(sessionLink).toBeVisible();
    await expect(sessionLink).toHaveAttribute("href", /^\/charges\/\d+$/);

    const curveDetails = page.locator("details").filter({
      has: page.getByText(copy.samples, { exact: true }),
    }).first();
    await curveDetails.getByText(copy.samples, { exact: true }).click();
    const recordedValues = curveDetails.getByRole("table");
    await expect(recordedValues).toBeVisible();
    await expect.poll(() => recordedValues.getByRole("row").count()).toBeGreaterThan(1);
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )).toBeLessThanOrEqual(1);

    await five.click();
    await expect(page).toHaveURL(/\/charges\/analysis\?count=5$/);
    await expect(five).toHaveAttribute("aria-current", "page");
    await expect(ten).not.toHaveAttribute("aria-current", "page");
  });
}
