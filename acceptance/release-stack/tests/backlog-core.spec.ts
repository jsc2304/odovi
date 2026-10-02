import { expect, test } from "@playwright/test";
import { login } from "./helpers";
import { installBrowserEgressGuard } from "../egress";
import { execFileSync } from "node:child_process";

function database(sql: string) {
  const project = process.env.ODOVI_ACCEPTANCE_PROJECT;
  if (!project || !/^odovi-acceptance-[a-z0-9-]+$/.test(project)) throw new Error("A runner-owned disposable acceptance project is required");
  return execFileSync("docker", ["exec", "-i", `${project}-db-1`, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "odovi", "-d", "odovi"], { input: sql, encoding: "utf8" }).trim();
}

test.beforeEach(async ({ context }) => { await installBrowserEgressGuard(context); });

test("day and month refresh identify retained content until navigation completes", async ({ page }) => {
  await login(page);
  for (const view of ["day", "month"] as const) {
    await page.goto(view === "day" ? `/day/${process.env.ODOVI_ACCEPTANCE_DAY}` : `/calendar?month=${process.env.ODOVI_ACCEPTANCE_DAY!.slice(0, 7)}`);
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const target = view === "day" ? "**/day/2000-01-01*" : "**/calendar?month=2000-01*";
    await page.route(target, async (route) => { await held; await route.fallback(); });
    try {
      await page.locator(`input[type="${view === "day" ? "date" : "month"}"]`).fill(view === "day" ? "2000-01-01" : "2000-01");
      await expect(page.getByRole("status").filter({ hasText: /Showing the previous view|bisherige Ansicht/ })).toBeVisible();
    } finally { release(); }
    await expect(page).toHaveURL(view === "day" ? /\/day\/2000-01-01$/ : /\/calendar\?month=2000-01$/);
    await expect(page.getByRole("status").filter({ hasText: /Showing the previous view|bisherige Ansicht/ })).toHaveCount(0);
    await page.unroute(target);
  }
});

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
  await page.goto("/search?type=charges&vehicle=999999");
  await expect(page.getByTestId("search-summary")).toHaveCount(0);
  await expect(page.getByText(/No vehicle available|Kein Fahrzeug vorhanden/).last()).toBeVisible();
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
  await page.goto("/search?type=all");
  const input = page.getByRole("searchbox", { name: /Search|Suche/ });
  await input.fill("a".repeat(120));
  await expect(page.getByTestId("search-results")).toHaveAttribute("aria-busy", "true");
  await expect(page.getByTestId("search-results")).toHaveAttribute("aria-busy", "false");
  await expect(input).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("failed search keeps filters and recovers with retry", async ({ page }) => {
  test.skip(!process.env.ODOVI_ACCEPTANCE_PROJECT, "Requires the runner-owned fault-injection database");
  await login(page);
  database("alter table drives rename to drives_feedback_fault;");
  try {
    await page.goto("/search?q=Acceptance&type=drives");
    await expect(page.getByRole("alert").filter({ hasText: /Search could not be loaded|Suche konnte nicht geladen/ })).toBeVisible();
    await expect(page.getByRole("searchbox", { name: /Search|Suche/ })).toHaveValue("Acceptance");
  } finally { database("alter table drives_feedback_fault rename to drives;"); }
  await page.getByRole("button", { name: /Try again|Erneut versuchen/ }).click();
  await expect(page.getByTestId("search-summary")).toBeVisible();
  await expect(page).toHaveURL(/q=Acceptance&type=drives$/);
});

test("vehicle switching clears selection and exports only the selected archive", async ({ page }) => {
  test.skip(!process.env.ODOVI_ACCEPTANCE_PROJECT, "Requires the runner-owned multi-vehicle fixture");
  const vehicleId = Number(database("insert into vehicles (display_name, source, source_id) values ('Acceptance Second Vehicle', 'release-acceptance-navigation', 'second') returning id;"));
  database(`insert into drives (vehicle_id, start_time, end_time, start_address, end_address, classification, source, source_id) values (${vehicleId}, '${process.env.ODOVI_ACCEPTANCE_DAY}T10:00:00Z', '${process.env.ODOVI_ACCEPTANCE_DAY}T10:30:00Z', 'Second-only-origin', 'Second-only-destination', 'business', 'release-acceptance-navigation', 'second-drive');`);
  try {
    await login(page);
    await page.goto("/search?type=drives&vehicle=1");
    await page.getByRole("button", { name: /^(Select|Auswählen)$/ }).click();
    await page.getByRole("checkbox").first().click();
    await page.getByRole("combobox", { name: /Vehicle|Fahrzeug/ }).selectOption(String(vehicleId));
    await expect(page.getByTestId("search-summary")).toHaveText(/1 drive|1 Fahrt/);
    await expect(page.getByRole("button", { name: /^(Select|Auswählen)$/ })).toBeVisible();
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(page.locator('a[id^="drive-"]')).toHaveCount(1);
    const csv = await page.request.get(`/api/export/day/${process.env.ODOVI_ACCEPTANCE_DAY}?format=csv&vehicle=${vehicleId}`);
    expect(csv.status()).toBe(200);
    expect(await csv.text()).toContain("Second-only-origin");
    expect(await csv.text()).toContain("Acceptance Second Vehicle");
    expect((await page.request.get(`/api/export/day/${process.env.ODOVI_ACCEPTANCE_DAY}?format=csv&vehicle=999999`)).status()).toBe(404);
  } finally {
    database(`delete from drives where vehicle_id=${vehicleId}; delete from vehicles where id=${vehicleId};`);
  }
});

test("home and day explain missing vehicle and empty dates", async ({ page }) => {
  test.skip(!process.env.ODOVI_ACCEPTANCE_PROJECT, "Requires the runner-owned empty-data fixture");
  await login(page);
  const worker = `${process.env.ODOVI_ACCEPTANCE_PROJECT}-worker-1`;
  execFileSync("docker", ["pause", worker]);
  try {
    database("alter table vehicles rename to vehicles_empty_fixture; create view vehicles as select * from vehicles_empty_fixture where false;");
    try {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: /waiting for the first sync|wartet auf/i })).toBeVisible();
      await expect(page.getByRole("link", { name: /connection|Verbindung|Diagnos/i })).toBeVisible();
    } finally { database("drop view vehicles; alter table vehicles_empty_fixture rename to vehicles;"); }
  } finally { execFileSync("docker", ["unpause", worker]); }
  await page.goto("/day/2000-01-01");
  await expect(page.getByText(/No drives on this day|Keine Fahrten an diesem Tag/i).first()).toBeVisible();
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
