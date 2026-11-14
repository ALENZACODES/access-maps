import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Day 19 and Day 22 checks on the fixture demo journey: it completes by
 * keyboard alone, it passes axe in English and French, and it logs no console
 * errors. The demo uses labelled fixtures, not operator feeds or surveys.
 */
function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function isFocused(target: Locator): Promise<boolean> {
  return target.evaluate((element) => element === document.activeElement);
}

async function tabTo(page: Page, target: Locator, limit = 80): Promise<void> {
  for (let presses = 0; presses < limit; presses += 1) {
    if (await isFocused(target)) return;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

test.beforeEach(async ({ page }) => {
  page.on("request", (request) => {
    const { hostname, protocol } = new URL(request.url());
    // MapLibre starts its workers from blob: URLs. Only network requests matter here.
    if (protocol !== "http:" && protocol !== "https:") return;
    if (hostname !== "127.0.0.1" && hostname !== "localhost") {
      throw new Error(`Unexpected request to ${request.url()}`);
    }
  });
});

test("the demo journey completes by keyboard alone", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 2, name: "Journey results" })).toBeFocused();
  await expect(page.getByRole("heading", { level: 1, name: "Journey demo" })).toBeVisible();

  const call = page.getByRole("link", { name: "911" });
  await page.keyboard.press("Shift+Tab");
  await tabTo(page, call);

  // Reach the feature list through the skip link, then move with the arrow keys.
  const skip = page.getByRole("link", { name: "Skip the map canvas and go to the feature list" });
  await tabTo(page, skip);
  await page.keyboard.press("Enter");
  const list = page.getByRole("list", { name: "Map features" });
  const items = list.getByRole("button");
  const count = await items.count();
  expect(count).toBeGreaterThan(1);
  await tabTo(page, items.first());
  const status = page.locator(".selection-live");
  const firstStatus = await status.textContent();
  await page.keyboard.press("ArrowDown");
  await expect(items.nth(1)).toBeFocused();
  await expect(items.nth(1)).toHaveAttribute("aria-current", "true");
  await expect(status).not.toHaveText(firstStatus ?? "");
  await page.keyboard.press("End");
  await expect(items.nth(count - 1)).toBeFocused();
  await page.keyboard.press("Home");
  await expect(items.first()).toBeFocused();

  // Map controls work by keyboard and announce what happened.
  await page.keyboard.press("Shift+Tab");
  const show = page.getByRole("button", { name: "Show on map" });
  await tabTo(page, show);
  await page.keyboard.press("Enter");
  await expect(status).toContainText(/Show on map|The map canvas did not start/);

  // Tab leaves the page content: no keyboard trap.
  let escaped = false;
  for (let presses = 0; presses < 120; presses += 1) {
    await page.keyboard.press("Tab");
    const inBody = await page.evaluate(() => document.activeElement !== null && document.activeElement !== document.body && document.body.contains(document.activeElement));
    if (!inBody) {
      escaped = true;
      break;
    }
  }
  expect(escaped).toBe(true);
  expect(errors).toEqual([]);
});

test("every leg shows a step-free status and its source, and unknowns say Unknown", async ({ page }) => {
  await page.goto("/");
  const legs = page.locator("article.journey-result ol > li");
  expect(await legs.count()).toBeGreaterThan(0);
  for (const leg of await legs.all()) {
    await expect(leg.locator(".status")).toHaveText(/Step-free|Unknown|Not step-free|Information/);
    await expect(leg).toContainText("Source:");
    await expect(leg).toContainText("Licence:");
    await expect(leg).toContainText("Retrieved:");
  }
  await expect(page.locator(".status-unknown").first()).toContainText("Unknown");
});

test("the demo journey passes axe in English and French and switches by keyboard", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/");
  const english = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(english.violations, JSON.stringify(english.violations, null, 2)).toEqual([]);

  await tabTo(page, page.getByRole("link", { name: "Français" }));
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByRole("heading", { level: 1, name: "Démonstration de trajet" })).toBeVisible();
  await expect(page.getByText("Journey results")).toHaveCount(0);
  const french = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(french.violations, JSON.stringify(french.violations, null, 2)).toEqual([]);

  await page.getByRole("link", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(errors).toEqual([]);
});

test("a phone-width screen does not scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
