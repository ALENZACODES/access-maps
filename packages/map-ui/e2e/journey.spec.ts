import AxeBuilder from "@axe-core/playwright";
import { displayValue, planJourney, prototypeLabel } from "@access-maps/journey";
import { demoPlanInput } from "../demo/fixture.js";
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

for (const locale of ["en", "fr"] as const) {
  test(`every outbound and return leg retains its status and provenance with route comparison open (${locale})`, async ({ page }) => {
    const french = locale === "fr";
    const planned = planJourney(demoPlanInput(locale));
    const routes = [...planned.journeys, ...planned.blocked];
    const colon = french ? "\u00a0:" : ":";
    const statusLabels = french
      ? { "step-free": "■ Sans marches", "not-step-free": "▲ Avec marches ou obstacle", unknown: "? Inconnu" }
      : { "step-free": "■ Step-free", "not-step-free": "▲ Not step-free", unknown: "? Unknown" };
    await page.goto(`/?lang=${locale}`);
    await page.getByRole("button", { name: french
      ? "Comparer les parcours selon vos préférences d’accessibilité"
      : "Compare routes with your accessibility preferences" }).click();
    await expect(page.locator(".route-needs-results > li").first()).toBeVisible();

    const article = page.getByRole("article");
    const directions = [
      { name: french ? "Segments de l’aller" : "Outbound legs", legs: routes.map((route) => route.legs) },
      { name: french ? "Segments du retour" : "Return legs", legs: routes.map((route) => route.returnJourney.legs) },
    ];
    expect(routes.length).toBeGreaterThan(0);
    for (const direction of directions) {
      const lists = article.getByRole("list", { name: direction.name, exact: true });
      const actual = await lists.evaluateAll((nodes, sourceLabel) => nodes.map((list) =>
        Array.from(list.querySelectorAll(":scope > li"), (row) => {
          const paragraphs = Array.from(row.querySelectorAll(":scope > p"));
          return {
            titles: Array.from(row.querySelectorAll(":scope > h4, :scope > h5"), (heading) => heading.textContent),
            statuses: paragraphs.filter((p) => p.classList.contains("status")).map((p) => ({
              codes: Array.from(p.classList).filter((name) => name.startsWith("status-")),
              label: p.textContent,
            })),
            provenance: paragraphs.map((p) => p.textContent ?? "").filter((text) => text.startsWith(sourceLabel)),
          };
        })), `Source${colon} `);
      const expected = direction.legs.map((legs) => legs.map((leg) => {
        const record = leg.provenance;
        const fields = [
          `Source${colon} ${displayValue(locale, record.sourceId)}.`,
          `Licence${colon} ${displayValue(locale, record.licence)}.`,
        ];
        if (record.attribution) fields.push(`Attribution${colon} ${record.attribution}.`);
        const retrieved = displayValue(locale, record.retrievedOn ?? record.retrievedAt);
        fields.push(`${french ? "Récupéré" : "Retrieved"}${colon} ${retrieved}.`, prototypeLabel(locale, record.tier));
        return {
          titles: [leg.title],
          statuses: [{ codes: [`status-${leg.stepFree.status}`], label: statusLabels[leg.stepFree.status] }],
          provenance: [fields.join(" ")],
        };
      }));
      expect(actual, direction.name).toEqual(expected);
    }
    await expect(article.locator(".status-unknown").first()).toContainText(french ? "Inconnu" : "Unknown");
  });

  test(`expanded route evidence is keyboard accessible on a narrow screen (${locale})`, async ({ page }) => {
    const french = locale === "fr";
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/?lang=${locale}`);
    const panel = page.getByRole("region", {
      name: french ? "Observations et incertitudes du parcours" : "Route evidence and uncertainty",
    });
    const toggle = panel.getByRole("button", {
      name: french ? "Consulter les observations du parcours" : "Inspect route evidence",
    });
    await toggle.focus();
    await page.keyboard.press("Enter");
    const sort = panel.getByRole("combobox", { name: french ? "Trier les options" : "Order options", exact: true });
    await page.keyboard.press("Tab");
    await expect(sort).toBeFocused();
    const axe = await new AxeBuilder({ page }).include(".route-evidence-panel")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"]).analyze();
    expect(axe.violations, JSON.stringify(axe.violations, null, 2)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    const smallControls = await panel.locator("button, input, select, summary").evaluateAll((controls) =>
      controls.filter((control) => {
        const bounds = control.getBoundingClientRect();
        return bounds.width < 44 || bounds.height < 44;
      }).map((control) => control.outerHTML));
    expect(smallControls).toEqual([]);
  });
}

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
