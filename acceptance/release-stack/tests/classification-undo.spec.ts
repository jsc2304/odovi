import { expect, test } from "@playwright/test";
import { installBrowserEgressGuard } from "../egress";
import { login } from "./helpers";

test.skip(process.env.ODOVI_EXPECT_CLASSIFICATION_UNDO !== "1", "Requires the migrated quick-classification undo build and synthetic acceptance data.");

for (const locale of ["en", "de"] as const) {
  for (const theme of ["light", "dark"] as const) {
    for (const width of [1365, 390]) {
      test(`classification undo and explicit forms: ${locale} ${theme} ${width}`, async ({ page, context }, testInfo) => {
        await installBrowserEgressGuard(context);
        await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
        await context.addCookies([
          { name: "odovi_locale", value: locale, url: process.env.ODOVI_ACCEPTANCE_BASE_URL! },
          { name: "odovi_theme", value: theme, url: process.env.ODOVI_ACCEPTANCE_BASE_URL! },
        ]);
        const pageErrors: string[] = [];
        page.on("pageerror", error => pageErrors.push(error.message));
        await login(page);
        const dayPath = `/day/${process.env.ODOVI_ACCEPTANCE_DAY}`;
        await page.goto(dayPath);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        if (theme === "dark") await expect(page.locator("html")).toHaveClass(/dark/);
        const group = page.locator("[data-drive-classification]").first();
        await expect(group).toBeVisible();
        const old = await group.getAttribute("data-drive-classification");
        const next = old === "business" ? "private" : "business";
        const category = next === "business" ? /Business|Geschäftl/i : /Private|Privat/i;
        const detailHref = await group.locator("xpath=ancestor::li").locator('a[href^="/drives/"]').first().getAttribute("href");
        expect(detailHref).toBeTruthy();
        await group.getByRole("button", { name: category }).click();
        const receipt = page.getByRole("region", { name: /Last quick classification|Letzte Schnellklassifizierung/ });
        const undo = receipt.getByRole("button", { name: /Undo classification|Klassifizierung rückgängig/ });
        await expect(undo).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath("single.png"), fullPage: true });
        await page.reload();
        await expect(undo).toBeVisible();
        await undo.click();
        await expect(receipt).toContainText(/Classification restored|Klassifizierung wiederhergestellt/);
        await expect(group).toHaveAttribute("data-drive-classification", old!);

        await page.getByRole("button", { name: /^Select$|^Auswählen$/ }).click();
        await page.getByRole("button", { name: /^All$|^Alle$/ }).click();
        await expect(page.getByText(/immediately classifies all|klassifiziert sofort alle/)).toBeVisible();
        await page.getByRole("group", { name: /Apply classification|Klassifizierung anwenden/ }).getByRole("button", { name: category }).click();
        await expect(undo).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath("bulk.png"), fullPage: true });
        await page.getByRole("button", { name: /^Done$|^Fertig$/ }).click();
        await page.locator('a[href^="/drives/"]').first().click();
        await expect(page).toHaveURL(/\/drives\/\d+(?:\?.*)?$/);
        await expect(undo).toBeVisible();
        await undo.click();
        await expect(receipt).toContainText(/Classification restored|Klassifizierung wiederhergestellt/);

        const save = page.getByRole("button", { name: /^Save$|^Speichern$/ });
        const notes = page.getByRole("textbox", { name: /Notes|Notizen/ });
        await expect(save).toBeDisabled();
        const stored = await notes.inputValue();
        await notes.fill(`${stored} [unsaved acceptance edit]`);
        await expect(save).toBeEnabled();
        page.once("dialog", dialog => dialog.dismiss());
        await page.locator('a[href="/"]:visible').first().click();
        await expect(page).toHaveURL(/\/drives\/\d+(?:\?.*)?$/);
        await expect(notes).toHaveValue(`${stored} [unsaved acceptance edit]`);
        // Build known same-document history; Back and Forward cancellation must
        // preserve draft, current URL and history length without sentinel entries.
        await page.getByRole("button", { name: /Discard changes|Änderungen verwerfen/ }).click();
        await page.evaluate(() => history.replaceState({ ...history.state, odoviGuardTest: "preserved" }, ""));
        await page.locator('a[href="/"]:visible').first().click();
        await expect(page).toHaveURL(/\/$/);
        await page.goBack();
        await expect(page).toHaveURL(/\/drives\/\d+(?:\?.*)?$/);
        await notes.fill(`${stored} [unsaved acceptance edit]`);
        const detailUrl = page.url();
        const historyLength = await page.evaluate(() => history.length);
        expect(await page.evaluate(() => history.state.odoviGuardTest)).toBe("preserved");
        expect(await page.evaluate(() => history.state.__NA)).toBe(true);
        const forwardDialog = page.waitForEvent("dialog");
        await page.evaluate(() => history.forward());
        await (await forwardDialog).dismiss();
        await expect(page).toHaveURL(detailUrl);
        await expect(notes).toHaveValue(`${stored} [unsaved acceptance edit]`);
        expect(await page.evaluate(() => history.length)).toBe(historyLength);
        const backDialog = page.waitForEvent("dialog");
        await page.evaluate(() => history.back());
        await (await backDialog).dismiss();
        await expect(page).toHaveURL(detailUrl);
        await expect(notes).toHaveValue(`${stored} [unsaved acceptance edit]`);
        expect(await page.evaluate(() => history.length)).toBe(historyLength);
        const unloadDialog = page.waitForEvent("dialog");
        const initiatingReload = page.evaluate(() => location.reload());
        const nativeWarning = await unloadDialog;
        expect(nativeWarning.type()).toBe("beforeunload");
        await nativeWarning.dismiss();
        await initiatingReload;
        await expect(notes).toHaveValue(`${stored} [unsaved acceptance edit]`);
        const acceptBackDialog = page.waitForEvent("dialog");
        await page.evaluate(() => history.back());
        await (await acceptBackDialog).accept();
        await expect(page).toHaveURL(new RegExp(dayPath + "$"));
        await expect(group).toBeVisible();
        await page.goForward();
        await expect(page).toHaveURL(detailUrl);
        await expect(notes).toHaveValue(stored);
        await expect(save).toBeDisabled();
        await notes.fill(`${stored} [unsaved acceptance edit]`);

        await page.getByRole("button", { name: /Discard changes|Änderungen verwerfen/ }).click();
        await expect(notes).toHaveValue(stored);
        await expect(save).toBeDisabled();
        await notes.fill(`${stored} [saved acceptance edit]`);
        await save.click();
        await expect(page.getByRole("status").filter({ hasText: /^Saved$|^Gespeichert$/ })).toBeVisible();
        await page.reload();
        await expect(notes).toHaveValue(`${stored} [saved acceptance edit]`);
        await notes.fill(stored);
        await save.click();
        await expect(save).toBeDisabled();
        await page.screenshot({ path: testInfo.outputPath("form.png"), fullPage: true });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        expect(pageErrors).toEqual([]);
      });
    }
  }
}

test("large search bulk actions settle at the same URL and preserve prior categories", async ({ page, context }) => {
  await installBrowserEgressGuard(context);
  await login(page);
  await page.goto("/search?type=drives");
  const links = page.locator('a[id^="drive-"]');
  await expect(page.getByTestId("search-summary")).toBeVisible();
  const count = Number((await page.getByTestId("search-summary").innerText()).match(/\d+/)?.[0]);
  expect(count).toBeGreaterThan(100); // The shared release fixture exercises a large streamed result tree.
  await expect(links).toHaveCount(count);
  const categories = () => links.evaluateAll(elements => elements.map(element => ({
    id: element.id,
    category: element.querySelector("span.rounded-full")?.textContent?.trim(),
  })).sort((a, b) => a.id.localeCompare(b.id)));
  const before = await categories();

  await page.getByRole("button", { name: /^Select$|^Auswählen$/ }).click();
  await page.getByTestId("search-results").getByRole("button", { name: /^All$|^Alle$/ }).click();
  await page.getByRole("group", { name: /Apply classification|Klassifizierung anwenden/ }).getByRole("button", { name: /Business|Geschäftlich/ }).click();
  const receipt = page.getByRole("region", { name: /Last quick classification|Letzte Schnellklassifizierung/ });
  await expect(receipt.getByRole("button", { name: /Undo classification|Klassifizierung rückgängig/ })).toBeVisible();
  await expect(page.getByRole("group", { name: /Apply classification|Klassifizierung anwenden/ })).toHaveCount(0);
  await expect(links).toHaveCount(count);
  await expect(page).toHaveURL(/\/search\?type=drives$/);

  await receipt.getByRole("button", { name: /Undo classification|Klassifizierung rückgängig/ }).click();
  await expect(receipt).toContainText(/Classification restored|Klassifizierung wiederhergestellt/);
  await expect(links).toHaveCount(count);
  expect(await categories()).toEqual(before);
  await expect(page).toHaveURL(/\/search\?type=drives$/);
});
