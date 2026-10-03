import { expect, test } from "@playwright/test";
import { login } from "./helpers";
import { installBrowserEgressGuard } from "../egress";

test.beforeEach(async ({ context }) => { await installBrowserEgressGuard(context); });

test("empty day input and previous-day link settle with streamed data", async ({ page }) => {
  const date = process.env.ODOVI_ACCEPTANCE_DAY!;
  await login(page);
  await page.goto("/day/2099-06-01");
  await page.waitForLoadState("networkidle");
  const input = page.locator('input[type="date"]');
  await input.fill(date);
  await expect(page).toHaveURL(new RegExp(`/day/${date}(?:\\?.*)?$`));
  await expect(input).toHaveValue(date);
  await expect(page.getByTestId("day-totals")).toBeVisible();
  await expect(page.locator('a[id^="drive-"]').first()).toBeVisible();

  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  await page.goto(`/day/${next.toISOString().slice(0, 10)}`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: /Previous day|Vorheriger Tag/ }).click();
  await expect(page).toHaveURL(new RegExp(`/day/${date}(?:\\?.*)?$`));
  await expect(input).toHaveValue(date);
  await expect(page.getByTestId("day-totals")).toBeVisible();
  await expect(page.locator('a[id^="drive-"]').first()).toBeVisible();
});

test("route-data refresh preserves an unsaved annotation draft", async ({ page }) => {
  await login(page);
  await page.goto(`/day/${process.env.ODOVI_ACCEPTANCE_DAY}`);
  await page.locator('a[id^="drive-"]').first().click();
  const notes = page.locator('textarea[name="notes"]');
  await expect(notes).toBeVisible();
  const stored = await notes.inputValue();
  const draft = `${stored} [unsaved refresh acceptance]`;
  await notes.fill(draft);
  const localeButton = page.getByRole("button", { name: "DE", exact: true });
  await localeButton.click(); // The locale control refreshes the current route.
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(notes).toHaveValue(draft);
  await expect(page.getByRole("button", { name: /^Speichern$/ })).toBeEnabled();
  await page.getByRole("button", { name: /Änderungen verwerfen/ }).click();
  await expect(notes).toHaveValue(stored);
  await expect(page.getByRole("button", { name: /^Speichern$/ })).toBeDisabled();
});
