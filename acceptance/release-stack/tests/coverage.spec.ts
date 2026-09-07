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

test("yearly destination insights require sign-in", async ({ page }) => {
  for (const route of ["/places/heatmap", "/wrapped"]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login$/);
  }
});

for (const copy of [
  { locale: "en", button: "EN", entry: "Explore destination visits", title: "Destination visits", year: "Year", classification: "Drive classification", apply: "Apply filters", top: "Top visited destinations", wrapped: "Open yearly Wrapped", print: "Print / Save as PDF", monthCaption: "Monthly driving distance for", chargeScope: "independent of the drive classification filter" },
  { locale: "de", button: "DE", entry: "Zielbesuche entdecken", title: "Zielbesuche", year: "Jahr", classification: "Fahrtklassifikation", apply: "Filter anwenden", top: "Meistbesuchte Ziele", wrapped: "Jahres-Wrapped öffnen", print: "Drucken / Als PDF speichern", monthCaption: "Monatliche Fahrstrecke für", chargeScope: "unabhängig vom Filter der Fahrtklassifikation" },
]) {
  test(`yearly destinations and Wrapped preserve filters and print context in ${copy.locale}`, async ({ page, browserName }, testInfo) => {
    const year = process.env.ODOVI_ACCEPTANCE_DAY!.slice(0, 4);
    await page.context().addCookies([{
      name: "odovi_theme", value: "dark", url: process.env.ODOVI_ACCEPTANCE_BASE_URL!, sameSite: "Lax",
    }]);
    await page.addInitScript(() => {
      window.print = () => { document.documentElement.dataset.printRequested = "true"; };
    });
    await page.goto("/login");
    await page.getByRole("button", { name: copy.button, exact: true }).click();
    await login(page);
    await page.goto("/places");
    await page.getByRole("link", { name: copy.entry, exact: true }).click();
    await expect(page.getByRole("heading", { name: copy.title, level: 1 })).toBeVisible();
    await page.getByRole("combobox", { name: copy.year, exact: true }).selectOption(year);
    await page.getByRole("combobox", { name: copy.classification, exact: true }).selectOption("private");
    const apply = page.getByRole("button", { name: copy.apply, exact: true });
    expect((await apply.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await apply.click();
    await expect(page).toHaveURL(new RegExp(`/places/heatmap\\?year=${year}&classification=private$`));
    await expect(page.getByRole("heading", { name: copy.top })).toBeVisible();
    await expect(page.getByRole("combobox", { name: copy.classification, exact: true })).toHaveValue("private");
    await page.getByRole("link", { name: copy.wrapped, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/wrapped\\?year=${year}&classification=private$`));
    await expect(page.getByRole("heading", { name: `Odovi Wrapped ${year}`, level: 1 })).toBeVisible();
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await expect(page.getByRole("combobox", { name: copy.year, exact: true })).toHaveValue(year);
    await expect(page.getByRole("combobox", { name: copy.classification, exact: true })).toHaveValue("private");
    await expect(page.getByRole("table", { name: `${copy.monthCaption} ${year}`, exact: true }).getByRole("row")).toHaveCount(13);
    await expect(page.locator("[data-wrapped-charge-scope]")).toContainText(copy.chargeScope);
    const destinationMap = page.locator("[data-yearly-destinations] .leaflet-container");
    const destinationMarkers = destinationMap.locator('.leaflet-marker-pane [role="img"]');
    const printMap = page.locator("[data-destination-print-map] svg");
    const mapAttribution = page.getByTestId("map-provider-attribution");
    let destinationMarkerCount = 0;
    let snapshotTileCount = 0;
    let attributionText = "";
    let attributionHref = "";
    if (await mapAttribution.count()) {
      await expect(destinationMap).toBeVisible();
      await expect(destinationMap.locator(".leaflet-overlay-pane svg circle").first()).toBeVisible();
      await expect.poll(() => destinationMarkers.count()).toBeGreaterThan(0);
      destinationMarkerCount = await destinationMarkers.count();
      await expect.poll(() => destinationMap.locator("img.leaflet-tile:not(.leaflet-tile-loaded)").count()).toBe(0);
      await expect.poll(() => printMap.locator("image").count()).toBeGreaterThan(0);
      snapshotTileCount = await printMap.locator("image").count();
      attributionText = await mapAttribution.innerText();
      attributionHref = (await mapAttribution.getAttribute("href"))!;
    }
    const print = page.getByRole("button", { name: copy.print, exact: true });
    expect((await print.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await print.click();
    await expect(page.locator("html")).toHaveAttribute("data-print-requested", "true");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

    const screenViewport = page.viewportSize();
    await page.emulateMedia({ media: "print" });
    if (testInfo.project.name === "desktop" && screenViewport) {
      // A4 minus the report's two 14mm margins. Wide desktop viewports can
      // otherwise hide intrinsic SVG sizing that clips the actual PDF page.
      await page.setViewportSize({ ...screenViewport, width: Math.floor(182 / 25.4 * 96) });
    }
    if (destinationMarkerCount > 0) {
      await expect(destinationMap).not.toBeVisible();
      await expect(printMap).toBeVisible();
      await expect(printMap.locator("[data-destination-print-marker]")).toHaveCount(destinationMarkerCount);
      await expect(printMap.locator("image")).toHaveCount(snapshotTileCount);
      await expect.poll(() => printMap.evaluate((map) => {
        const bounds = (map as SVGSVGElement).viewBox.baseVal;
        const markers = Array.from(map.querySelectorAll<SVGCircleElement>("[data-destination-print-marker]"));
        return markers.every((marker) => {
          const centerX = marker.cx.baseVal.value;
          const centerY = marker.cy.baseVal.value;
          return centerX >= bounds.x && centerX <= bounds.x + bounds.width
            && centerY >= bounds.y && centerY <= bounds.y + bounds.height;
        });
      })).toBe(true);
      await expect(mapAttribution).toBeVisible();
      await expect(mapAttribution).toHaveText(attributionText);
      await expect(mapAttribution).toHaveAttribute("href", attributionHref);
      await expect.poll(() => printMap.evaluate((map) => {
        const svg = map.getBoundingClientRect();
        const card = map.closest("[data-yearly-card]")!.getBoundingClientRect();
        const report = map.closest("[data-wrapped]")!.getBoundingClientRect();
        const markerBoxes = Array.from(map.querySelectorAll("[data-destination-print-marker]"), (marker) => marker.getBoundingClientRect());
        return {
          reportFits: report.width <= document.documentElement.clientWidth + 1,
          cardFits: card.left >= report.left - 1 && card.right <= report.right + 1,
          mapFits: svg.left >= card.left - 1 && svg.right <= card.right + 1,
          markersPaintInsideMap: markerBoxes.every((box) => box.width > 0 && box.height > 0
            && box.left >= svg.left && box.right <= svg.right && box.top >= svg.top && box.bottom <= svg.bottom),
        };
      })).toEqual({ reportFits: true, cardFits: true, mapFits: true, markersPaintInsideMap: true });
    }
    if (testInfo.project.name === "desktop" && browserName === "chromium") {
      const pdfPath = testInfo.outputPath("wrapped-print.pdf");
      await page.pdf({ path: pdfPath, printBackground: true, preferCSSPageSize: true, format: "A4" });
      await testInfo.attach("wrapped-print", { path: pdfPath, contentType: "application/pdf" });
    }
    await expect(print).not.toBeVisible();
    await expect(page.locator("[data-yearly-filters]")).not.toBeVisible();
    await expect(page.locator("[data-wrapped-context]")).toBeVisible();
    await expect(page.locator("[data-wrapped-charge-scope]")).toBeVisible();
    await expect(page.getByRole("heading", { name: copy.top })).toBeVisible();
    const navigation = page.locator("aside, header, nav");
    expect(await navigation.count()).toBeGreaterThan(0);
    for (const element of await navigation.all()) await expect(element).not.toBeVisible();

    const printColors = await page.locator("[data-wrapped]").evaluate((report) => {
      const effectiveBackground = (element: Element | null): string => {
        while (element) {
          const color = getComputedStyle(element).backgroundColor;
          if (color !== "rgba(0, 0, 0, 0)" && color !== "transparent") return color;
          element = element.parentElement;
        }
        return "transparent";
      };
      const headingColor = getComputedStyle(report.querySelector("h1")!).color;
      const rgb = headingColor.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/)?.slice(1).map(Number);
      const channels = rgb?.map((value) => {
        const normalized = value / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      const luminance = channels ? 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]! : Number.NaN;
      return {
        reportBackground: effectiveBackground(report),
        mainBackground: effectiveBackground(report.closest("main")),
        headingContrastOnWhite: 1.05 / (luminance + 0.05),
      };
    });
    expect(printColors.reportBackground).toBe("rgb(255, 255, 255)");
    expect(printColors.mainBackground).toBe("rgb(255, 255, 255)");
    expect(printColors.headingContrastOnWhite).toBeGreaterThanOrEqual(4.5);
    await expect(page.locator("html")).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
    for (const placeholder of await page.getByTestId("map-tiles-disabled").all()) {
      await expect(placeholder).toHaveCSS("background-color", "rgb(255, 255, 255)");
    }
    if (testInfo.project.name === "desktop" && screenViewport) await page.setViewportSize(screenViewport);
    await page.emulateMedia({ media: "screen" });
  });
}
