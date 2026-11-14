import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  page.on("request", (request) => {
    const { hostname, protocol } = new URL(request.url());
    if (protocol !== "http:" && protocol !== "https:") return;
    if (hostname !== "127.0.0.1" && hostname !== "localhost") {
      throw new Error(`Unexpected request to ${request.url()}`);
    }
  });
});

async function axeClean(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

async function open(page: Page, query = "") {
  await page.goto(`/outages.html${query}`);
  await expect(page.getByRole("heading", { level: 2, name: "Elevator and escalator outages" })).toBeVisible();
}

test("Day 9: station outage shows station, elevator, status, demonstration source, time, and expiry", async ({ page }) => {
  await open(page);
  const cedarvale = page.locator(".station-outage").filter({ has: page.getByRole("heading", { name: "Station: Cedarvale" }) });
  await expect(cedarvale.getByText("The operator lists an outage at this station.")).toBeVisible();
  await expect(cedarvale.getByText("Elevator ELV02-B", { exact: true })).toBeVisible();
  await expect(cedarvale.getByText("Out of service").first()).toBeVisible();
  await expect(cedarvale.getByText("Demonstration data: a dated operator snapshot. It is not current status.")).toBeVisible();
  await expect(cedarvale.getByText(/No end time was published/).first()).toBeVisible();
  await expect(cedarvale.getByText(/gtfs-rt-ttc-accessibility\. Licence: OGL-Toronto-1\.0/).first()).toBeVisible();
  const stClair = page.locator(".station-outage").filter({ has: page.getByRole("heading", { name: "Station: St Clair West" }) });
  await expect(stClair.getByText(/No outage reported by gtfs-rt-ttc-accessibility as of .*This is not a check that the elevator works\./)).toBeVisible();
  await axeClean(page);
});

test("Day 9 and 10: the journey shows the outage on the leg and an option that avoids it", async ({ page }) => {
  await open(page);
  const note = page.getByRole("note", { name: "Outage on this leg" }).first();
  await expect(note).toContainText("Elevator ELV02-B at Cedarvale: Out of service.");
  await expect(page.locator(".outage-journey > p[role=status]")).toContainText("It may be out of date.");
  await expect(page.getByText("This option avoids Cedarvale.")).toBeVisible();
  await expect(page.getByText(/live|real-time/i)).toHaveCount(0);
});

test("Day 10: the Pape journey says there is no alternative and names Pape", async ({ page }) => {
  await open(page);
  await page.getByLabel("From near Pape Station").check();
  await expect(page.getByText("No option in the data avoids Pape. The original route stays listed with the outage.")).toBeVisible();
  await expect(page.getByRole("note", { name: "Outage on this leg" }).first()).toContainText("Elevator 8D1L at Pape");
});

test("Day 10: a power chair profile flags the alternative and names the setting", async ({ page }) => {
  await open(page);
  await expect(page.getByText("No profile setting flags this option.")).toBeVisible();
  await page.getByLabel("Power chair profile with a maximum gradient of 5%").check();
  await expect(page.getByText(/^Maximum gradient: /)).toBeVisible();
});

test("Day 10 and 12: original and alternative routes are reachable by keyboard, with visible focus", async ({ page }) => {
  await open(page);
  const original = page.getByRole("button", { name: /^Route with the outage/ });
  const option = page.getByRole("button", { name: /^Option 1/ });
  await original.focus();
  await expect(original).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Tab");
  await expect(option).toBeFocused();
  const outline = await option.evaluate((node) => getComputedStyle(node).outlineStyle);
  expect(outline).not.toBe("none");
  await page.keyboard.press("Enter");
  await expect(option).toHaveAttribute("aria-pressed", "true");
  await expect(option).toContainText("(shown)");
  const list = page.getByRole("list", { name: "Map features" });
  await expect(list).toContainText("Eglinton Ave West at Everden Rd");
  await original.focus();
  await page.keyboard.press("Space");
  await expect(list).toContainText("Cedarvale Station - Southbound Platform");
});

test("Day 12: map has a text list, status is not colour alone, controls need no drag, attribution implies no endorsement", async ({ page }) => {
  await open(page);
  const list = page.getByRole("list", { name: "Map features" });
  await expect(list.getByRole("button").first()).toBeVisible();
  await expect(list.getByText("▲ Not step-free").first()).toBeVisible();
  for (const name of ["Zoom in", "Zoom out", "Pan up", "Pan down", "Pan left", "Pan right", "Show on map"]) {
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Zoom in", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".selection-live")).toContainText(/Zoomed in|The map canvas did not start/);
  const first = list.getByRole("button").first();
  await first.focus();
  await page.keyboard.press("ArrowDown");
  await expect(list.getByRole("button").nth(1)).toBeFocused();
  await expect(page.locator(".map-attribution")).toContainText("Open Government Licence – Toronto");
  await expect(page.locator(".map-attribution")).toContainText("No endorsement by the TTC or the City of Toronto is implied.");
});

test("Day 12: the saved copy labels outage status last checked, not current", async ({ page }) => {
  await open(page);
  await page.getByLabel("Show the saved copy, as when offline").check();
  await expect(page.getByRole("status").filter({ hasText: "Last checked" }).first()).toBeVisible();
  const outageItems = page.getByRole("list", { name: "Map features" }).getByRole("button").filter({ hasText: "Elevator: Cedarvale" });
  await expect(outageItems.first()).toContainText("Last checked");
  await expect(page.getByText(/Saved plan as of/).first()).toBeVisible();
  await axeClean(page);
});

test("French: the outage view renders in French and axe is clean", async ({ page }) => {
  await page.goto("/outages.html?lang=fr");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByRole("heading", { level: 2, name: "Pannes d'ascenseurs et d'escaliers mécaniques" })).toBeVisible();
  await expect(page.getByText("Cette option évite Cedarvale.")).toBeVisible();
  await expect(page.getByRole("note", { name: "Panne sur ce tronçon" }).first()).toContainText("Ascenseur ELV02-B à Cedarvale : Hors service.");
  await axeClean(page);
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});
