import { expect, test } from "@playwright/test";
import { installBrowserEgressGuard } from "../egress";
import { noteDeferredContract, password } from "./helpers";

test("fresh release journey: setup, sync, day, classification, export, version path, logout", async ({
  context,
  page,
}, testInfo) => {
  await installBrowserEgressGuard(context);
  let driveHref = "";

  await test.step("language selection and setup validation", async () => {
    await page.goto("/login");
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByText("First-time setup: set a password")).toBeVisible();

    const setupToken = process.env.ODOVI_ACCEPTANCE_SETUP_TOKEN;
    expect(setupToken, "runner must provide the one-time setup token").toMatch(
      /^v1\.\d{10}\.[a-f0-9]{64}$/,
    );
    const replayPage = await context.newPage();
    await replayPage.goto("/login");
    await replayPage.getByLabel(/setup token/i).fill(setupToken!);
    const replayPasswords = replayPage.getByLabel(/Password|Repeat password/i);
    await replayPasswords.nth(0).fill(password);
    await replayPasswords.nth(1).fill(password);

    const inputs = page.getByLabel(/Password|Repeat password/i);
    const tokenInput = page.getByLabel(/setup token/i);
    await tokenInput.fill(setupToken!);
    await inputs.nth(0).fill("too-short");
    await inputs.nth(1).fill("different-value");
    await page.getByRole("button", { name: "Set password" }).click();
    await expect(page.getByText("The passwords do not match.", { exact: true })).toBeVisible();

    const missingPage = await context.newPage();
    await missingPage.goto("/login");
    const missingPasswords = missingPage.getByLabel(/Password|Repeat password/i);
    await missingPasswords.nth(0).fill(password);
    await missingPasswords.nth(1).fill(password);
    await missingPage
      .getByLabel(/setup token/i)
      .evaluate((input) => input.removeAttribute("required"));
    await Promise.all([
      missingPage.waitForResponse((response) =>
        response.request().method() === "POST" && response.url().endsWith("/login"),
      ),
      missingPage.getByRole("button", { name: "Set password" }).click(),
    ]);
    await expect(
      missingPage.getByText("The setup token is missing, invalid, or expired.", { exact: true }),
    ).toBeVisible();
    await missingPage.close();

    const incorrectPage = await context.newPage();
    await incorrectPage.goto("/login");
    const incorrectPasswords = incorrectPage.getByLabel(/Password|Repeat password/i);
    await incorrectPasswords.nth(0).fill(password);
    await incorrectPasswords.nth(1).fill(password);
    await incorrectPage
      .getByLabel(/setup token/i)
      .fill(`v1.${Math.floor(Date.now() / 1000)}.${"0".repeat(64)}`);
    await Promise.all([
      incorrectPage.waitForResponse((response) =>
        response.request().method() === "POST" && response.url().endsWith("/login"),
      ),
      incorrectPage.getByRole("button", { name: "Set password" }).click(),
    ]);
    await expect(
      incorrectPage.getByText("The setup token is missing, invalid, or expired.", { exact: true }),
    ).toBeVisible();
    await incorrectPage.close();

    await inputs.nth(0).fill(password);
    await inputs.nth(1).fill(password);
    await Promise.all([
      page.waitForResponse((response) => response.request().method() === "POST"),
      page.getByRole("button", { name: "Set password" }).click(),
    ]);
    await expect(page).toHaveURL(/\/$/);

    await Promise.all([
      replayPage.waitForResponse((response) => response.request().method() === "POST"),
      replayPage.getByRole("button", { name: "Set password" }).click(),
    ]);
    await expect(replayPage.getByText("A user already exists.", { exact: true })).toBeVisible();
    await replayPage.close();
  });

  await test.step("first synchronization and day view", async () => {
    const date = process.env.ODOVI_ACCEPTANCE_DAY;
    expect(date, "runner must provide a deterministic synchronized fixture day").toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
    await page.goto(`/day/${date}`);
    await expect(page.locator("[data-testid=day-totals]")).toBeVisible();
    await expect(page.locator("[data-drive-classification]").first()).toBeVisible();
    driveHref = (await page.locator('a[href^="/drives/"]').first().getAttribute("href")) ?? "";
    expect(driveHref).toMatch(/^\/drives\/\d+(?:\?returnTo=.+)?$/);
  });

  await test.step("keyboard classification", async () => {
    const group = page.locator("[data-drive-classification]").first();
    const business = group.getByRole("button", { name: /Business|Geschäftl/i });
    await business.focus();
    await expect(business).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(group).toHaveAttribute("data-drive-classification", "business");
  });

  await test.step("CSV export", async () => {
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "CSV" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^odovi-tag-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(await download.createReadStream()).not.toBeNull();
  });

  await test.step("manual annotation is searchable without a provider", async () => {
    await page.goto(driveHref);
    await page.locator('textarea[name="notes"]').fill("Acceptance annotation");
    await page.getByRole("button", { name: /Save|Speichern/i }).click();
    await expect(page.getByText(/Saved|Gespeichert/i, { exact: true })).toBeVisible();
    await page.goto("/search?q=Acceptance%20annotation");
    await expect(page.locator("[data-testid=search-summary]")).toContainText(/1 drive|1 Fahrt/i);
    const drivePath = driveHref.split("?")[0];
    await expect(page.locator(`a[href^="${drivePath}?"]`).last()).toBeVisible();
  });

  await test.step("discoverable release identity path", async () => {
    await page.goto("/settings");
    if (process.env.ODOVI_EXPECT_RELEASE_IDENTITY === "1") {
      await expect(page.locator("[data-testid=release-identity]")).toContainText(
        process.env.ODOVI_ACCEPTANCE_VERSION!,
      );
    } else {
      noteDeferredContract(
        testInfo,
        "#28",
        "Settings is covered; visible semantic version and build identity are added by #28.",
      );
    }
  });

  await test.step("logout", async () => {
    await page.getByRole("button", { name: /Log out|Abmelden/i }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
