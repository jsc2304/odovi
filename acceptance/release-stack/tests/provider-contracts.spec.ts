import { expect, test, type Page } from "@playwright/test";
import { installBrowserEgressGuard } from "../egress";
import { login } from "./helpers";

const endpoints = {
  weather: "http://provider:8080/weather",
  elevation: "http://provider:8080/elevation",
  mapTiles: "http://provider:8080/tiles/{z}/{x}/{y}.png",
  addressSearch: "http://provider:8080/search",
  routing: "http://provider:8080",
  externalNavigation: "https://controlled-navigation.invalid/navigate/{lat}/{lon}",
} as const;

async function activate(page: Page, capability: keyof typeof endpoints) {
  await page.goto("/settings#provider-review");
  const card = page.locator(`article:has(input[name="capability"][value="${capability}"])`);
  await card.getByRole("checkbox").check();
  await card.locator('input[type="radio"][value="custom"]').check();
  await card.locator("input[name=providerName]").fill(`Controlled ${capability}`);
  await card.locator("input[name=endpoint]").fill(endpoints[capability]);
  await card.locator("input[name=customContactUrl]").fill("http://provider:8080/policy");
  await card.locator("input[name=credentialHeader]").fill("X-Odovi-Acceptance");
  await card.locator("textarea[name=customOperatingLimits]").fill("Disposable acceptance endpoint only.");
  await card.getByRole("button", { name: /Save decision|Entscheidung speichern/i }).click();
  await expect(card.getByText(/Decision saved|Entscheidung gespeichert/i)).toBeVisible();
}

test("activated capabilities use only controlled provider contracts", async ({ context, page }, testInfo) => {
  await installBrowserEgressGuard(context);
  const browserRequests: string[] = [];
  context.on("request", (request) => browserRequests.push(request.url()));
  await login(page);

  for (const capability of Object.keys(endpoints) as (keyof typeof endpoints)[]) {
    await activate(page, capability);
  }

  await page.goto("/");
  await expect(page.locator("[data-testid=map-provider-attribution]").first()).toContainText("Controlled mapTiles");
  await expect(page.locator("[data-testid=map-tiles-disabled]")).toHaveCount(0);

  if (process.env.ODOVI_EXPECT_INSIGHTS_FIXTURE === "1") {
    await test.step("yearly destination heatmap and print use the activated tile provider", async () => {
      const year = process.env.ODOVI_ACCEPTANCE_INSIGHTS_YEAR!;
      await page.goto(`/wrapped?year=${year}&classification=private`);
      const map = page.locator("[data-yearly-destinations] .leaflet-container");
      const snapshot = page.locator("[data-destination-print-map] svg");
      await expect(map).toBeVisible();
      await expect(map.locator('.leaflet-marker-pane [role="img"]')).toHaveCount(2);
      await expect.poll(() => map.locator("img.leaflet-tile:not(.leaflet-tile-loaded)").count()).toBe(0);
      await expect.poll(() => snapshot.locator("image").count()).toBeGreaterThan(0);
      const radii = await map.locator(".leaflet-overlay-pane svg circle").evaluateAll((circles) =>
        circles.map((circle) => Number(circle.getAttribute("r"))).sort((a, b) => a - b));
      expect(radii).toHaveLength(2);
      expect(radii[1]).toBeGreaterThan(radii[0]!);

      await page.emulateMedia({ media: "print" });
      await expect(map).not.toBeVisible();
      await expect(snapshot).toBeVisible();
      await expect(snapshot.locator("[data-destination-print-marker]")).toHaveCount(2);
      await expect(page.getByTestId("map-provider-attribution")).toBeVisible();
      await expect(page.getByTestId("map-provider-attribution")).toHaveText("Controlled mapTiles");
      const pdfPath = testInfo.outputPath("wrapped-active-map.pdf");
      await page.pdf({ path: pdfPath, format: "A4", printBackground: true, preferCSSPageSize: true });
      await testInfo.attach("wrapped-active-map", { path: pdfPath, contentType: "application/pdf" });
      await page.emulateMedia({ media: "screen" });
    });
  }

  await page.goto("/places/new");
  const query = page.locator('input[type="search"]').first();
  const postsBeforeTyping = browserRequests.filter((url) => url.startsWith(process.env.ODOVI_ACCEPTANCE_BASE_URL!) && url.includes("/places/new")).length;
  await query.fill("Controlled destination");
  await page.waitForTimeout(300);
  expect(browserRequests.filter((url) => url.startsWith(process.env.ODOVI_ACCEPTANCE_BASE_URL!) && url.includes("/places/new")).length).toBe(postsBeforeTyping);
  await page.getByRole("button", { name: /Search|Suchen/i }).click();
  await page.getByRole("button", { name: "Acceptance Road, Zurich" }).click();

  await page.goto("/planner");
  const destination = page.getByRole("combobox").last();
  await destination.fill("Controlled destination");
  await page.getByRole("button", { name: /Search|Suchen/i }).last().click();
  await page.getByRole("button", { name: "Acceptance Road, Zurich" }).click();
  await page.getByRole("button", { name: /Calculate route|Route berechnen/i }).click();
  await expect(page.getByRole("button", { name: /Save as Journey|Als Reise speichern/i })).toBeVisible();

  await page.addInitScript(() => localStorage.setItem("odovi:offline-roadtrip:v1", JSON.stringify({ journeyId: 1, journeyName: "Acceptance roadtrip", version: 1, savedAt: "2026-08-26T12:00:00.000Z", plan: { stops: [{ id: "start", label: "Start", lat: 47.1, lon: 8.1, kind: "start" }, { id: "finish", label: "Finish", lat: 47.2, lon: 8.2, kind: "destination" }], legs: [{ fromStopId: "start", toStopId: "finish", distanceKm: 12, durationSeconds: 900, arrivalSoc: 70 }] } })));
  await page.goto("/roadtrip-offline");
  expect(browserRequests.some((url) => url.includes("controlled-navigation.invalid"))).toBe(false);
  await page.locator("[data-testid=external-navigation]").click();
  await expect.poll(() => browserRequests.filter((url) => url.includes("controlled-navigation.invalid")).length).toBe(1);
});
