import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import AxeBuilder from "@axe-core/playwright";
import { expect, test as base, type Page } from "@playwright/test";

const assets = new URL("../../docs/attribution/", import.meta.url);
const mime: Record<string, string> = {
  html: "text/html; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
};

// Exercise the production bytes, including the page's CSP. The journey
// harness uses Vite, which would otherwise rewrite module scripts and HTML.
const test = base.extend<object, { readerOrigin: string }>({
  readerOrigin: [async ({}, use) => {
    const server = createServer(async (req, res) => {
      const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
      const name = /^\/docs\/attribution\/([a-z0-9-]+\.(html|css|mjs))$/u.exec(pathname);
      if (!name || req.method !== "GET") {
        res.writeHead(404).end();
        return;
      }
      try {
        const bytes = await readFile(new URL(name[1], assets));
        res.writeHead(200, { "Content-Type": mime[name[2]] }).end(bytes);
      } catch {
        res.writeHead(404).end();
      }
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject).listen(0, "127.0.0.1", resolve);
    });
    try {
      const { port } = server.address() as AddressInfo;
      await use(`http://127.0.0.1:${port}/docs/attribution/`);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close(error => error ? reject(error) : resolve()));
    }
  }, { scope: "worker" }],
});

async function audit(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(results.violations.map(v => [v.id, v.nodes.map(n => n.target)])).toEqual([]);
}

async function measureControls(page: Page) {
  const defects = await page.locator("a[href], button, select, input").evaluateAll(nodes =>
    nodes.filter(node => node.getClientRects().length > 0).flatMap(node => {
      const rect = node.getBoundingClientRect();
      return rect.width < 44 || rect.height < 44
        ? [{ id: node.id, label: node.textContent, width: rect.width, height: rect.height }]
        : [];
    }));
  expect(defects).toEqual([]);
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

// Inspect the platform-facing AX tree as well as the rendered layout. A
// visible label or status paragraph can exist while being hidden from AT.
async function checkReadingOrderAndAnnouncements(page: Page, language: "en" | "fr") {
  const session = await page.context().newCDPSession(page);
  try {
    const { nodes } = await session.send("Accessibility.getFullAXTree");
    const exposed = nodes.filter(node => !node.ignored);
    const headings = exposed.filter(node => node.role?.value === "heading");
    expect(headings.filter(node =>
      node.properties?.some(property => property.name === "level" && property.value.value === 1))
      .map(node => node.name?.value)).toEqual([words[language].heading]);
    expect(exposed.filter(node => node.role?.value === "combobox")
      .map(node => node.name?.value)).toEqual([words[language].region, words[language].tranche]);
    const picker = exposed.find(node => node.role?.value === "button"
      && node.name?.value === (language === "fr" ? "Fichier manifeste" : "Manifest file"));
    expect(picker?.description?.value).toContain("manifest.json");
    const status = exposed.find(node => node.role?.value === "status");
    expect(status?.properties?.find(property => property.name === "live")?.value.value).toBe("polite");
    expect(status?.properties?.find(property => property.name === "atomic")?.value.value).toBe(true);
    const alert = exposed.find(node => node.role?.value === "alert");
    expect(alert?.properties?.find(property => property.name === "live")?.value.value).toBe("assertive");
    expect(exposed.filter(node => node.role?.value === "article")).toHaveLength(4);
    expect(exposed.some(node => node.role?.value === "StaticText"
      && node.name?.value === "© OpenStreetMap contributors")).toBe(true);
  } finally {
    await session.detach();
  }
}

async function saveSelection(page: Page, language: "en" | "fr") {
  const pending = page.waitForEvent("download");
  await page.locator("#pack-export").click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe(`map-pack-sources-${language}.txt`);
  expect(await download.failure()).toBe(null);
  const path = await download.path();
  if (!path) throw new Error("The source list has no download path");
  return readFile(path, "utf8");
}

// Test a many-source file without manufacturing place records. This is just
// the metadata format emitted by the pack builder, with fictional source IDs.
function localManifest(sourceCount = 1) {
  const cell = "n43.0_w080.0";
  const sources = Array.from({ length: sourceCount }, (_, i) => {
    const index = String(i + 1).padStart(2, "0");
    return {
      sourceId: `sample-${index}`, name: `Sample source ${index}`, licence: "Sample terms",
      attribution: "Credit supplied by the file.", licenceUrl: "https://example.invalid/terms",
      retrieved: "2024-02-29", shareAlike: false, inWebPack: true, heldReason: null,
    };
  });
  const parts = sources.map(s => ({
    sourceId: s.sourceId, count: 1, bytes: 128, sha256: "a".repeat(64),
    path: `venues/${s.sourceId}/${cell}.ndjson.gz`,
  }));
  const bbox = [-80, 43, -79.5, 43.5];
  return {
    version: 1, builtAt: "2024-03-01T12:00:00Z", sourceCommit: "0".repeat(40),
    sources, regions: [{ id: "sample", label: { en: "Sample region", fr: "Région exemple" }, bbox, cells: [cell] }],
    tranches: {
      venue: { cells: { [cell]: { parts, bbox } } }, washroom: { cells: {} },
      path: { cells: {} }, transit: { cells: {} },
    },
    counts: {
      records: sourceCount, bySource: Object.fromEntries(sources.map(s => [s.sourceId, 1])),
      byTranche: { venue: sourceCount },
    }, withheld: [], tiles: {}, search: {},
  };
}

const words = {
  en: { link: "Read sources in a map pack", heading: "Map pack sources", sample: "Explore an example",
    region: "Region", tranche: "Layer", button: "Save source list", sampleTag: "Example ·" },
  fr: { link: "Consulter les sources d’un lot cartographique", heading: "Sources d’un jeu de données cartographiques",
    sample: "Explorer un exemple", region: "Région", tranche: "Couche", button: "Enregistrer la liste des sources",
    sampleTag: "Exemple ·" },
};

for (const language of ["en", "fr"] as const) {
  test(`${language}: enter from the attribution home, select a region and export its exact credits`,
    async ({ readerOrigin, page, context }) => {
      const t = words[language];
      await page.setViewportSize({ width: 320, height: 760 });
      await page.goto(readerOrigin + "index.html");
      await page.getByRole("link", { name: t.link, exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("lang", language);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t.heading);
      await audit(page);

      // Once loaded, filtering, language, the example and export work offline.
      await context.setOffline(true);
      await page.getByRole("button", { name: t.sample }).click();
      await expect(page.getByRole("article")).toHaveCount(4);
      await expect(page.getByText("© OpenStreetMap contributors", { exact: true })).toHaveCount(1);
      await expect(page.locator("#pack-origin")).toContainText(t.sampleTag);
      await expect(page.getByRole("button", { name: t.button })).toBeEnabled();
      await measureControls(page);
      await audit(page);
      await checkReadingOrderAndAnnouncements(page, language);

      await page.getByRole("combobox", { name: t.region, exact: true }).selectOption("london");
      await page.getByRole("combobox", { name: t.tranche, exact: true }).selectOption("transit");
      const source = page.getByRole("article");
      await expect(source).toHaveCount(1);
      await expect(source.getByRole("heading", {level: 3})).toHaveText("London Transit Commission GTFS");
      await expect(source.getByText("UNKNOWN", {exact: true})).toHaveCount(1);
      await expect(source.getByRole("link")).toHaveAttribute("href",
        "https://www.londontransit.ca/open-data/ltcs-open-data-terms-of-use/");
      const text = await saveSelection(page, language);
      expect(text).toContain(t.sampleTag);
      expect(text).toContain("gtfs-ltc");
      expect(text).toContain("588");
      expect(text).toContain("2026-11-13");
      expect(text).not.toMatch(/osm-ontario|metrolinx-(?:go|up)|MiWay/u);

      await page.getByLabel(t.tranche, { exact: true }).selectOption("washroom");
      await expect(page.getByRole("article")).toHaveCount(0);
      await expect(page.getByRole("status")).toContainText("0 sources");
      await audit(page);
    });
}

test("keyboard navigation, visible focus, language retention and clear on the native controls",
  async ({ readerOrigin, page }) => {
    await page.goto(readerOrigin + "pack-reader.html?lang=en");
    await page.keyboard.press("Tab");
    await expect(page.locator("#pack-skip")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("main")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator("#pack-file")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator("#pack-example")).toBeFocused();
    const outline = await page.locator("#pack-example").evaluate(el => ({
      width: parseFloat(getComputedStyle(el).outlineWidth), style: getComputedStyle(el).outlineStyle,
      visible: el.matches(":focus-visible"),
    }));
    expect(outline.visible).toBe(true);
    expect(outline.width).toBeGreaterThanOrEqual(2);
    expect(outline.style).not.toBe("none");
    await page.keyboard.press("Space");
    await page.locator("#pack-region").selectOption("toronto");
    await page.locator("#pack-tranche").selectOption("transit");
    await expect(page.getByRole("article")).toHaveCount(2);
    await page.locator("#pack-language").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.locator("#pack-language")).toBeFocused();
    await expect(page.locator("#pack-region")).toHaveValue("toronto");
    await expect(page.locator("#pack-tranche")).toHaveValue("transit");
    await expect(page.getByRole("status")).toContainText("2 sources");
    await expect(page).toHaveURL(/lang=fr/u);
    const excerpt = await saveSelection(page, "fr");
    expect(excerpt).toMatch(/Région : Toronto/u);
    expect(excerpt).toMatch(/204/u);
    expect(excerpt).toMatch(/^Les utilisateurs doivent respecter les lois applicables/mu);
    await page.locator("#pack-clear").focus();
    await page.keyboard.press("Space");
    await expect(page.locator("#pack-file")).toBeFocused();
    await expect(page.getByRole("status")).toContainText("effacés");
    await expect(page.locator("#pack-results")).toBeHidden();
    await expect(page.getByRole("article")).toHaveCount(0);
  });

test("a large local selection pages on screen and exports every row without disclosing its filename",
  async ({ readerOrigin, page }) => {
    await page.goto(readerOrigin + "pack-reader.html");
    const outbound: string[] = [];
    page.on("request", request => {
      if (/^https?:/u.test(request.url()) && !request.url().startsWith(readerOrigin)) outbound.push(request.url());
    });
    const privateName = "local-review-copy-17.json";
    await page.locator("#pack-file").setInputFiles({
      name: privateName, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(localManifest(15))),
    });
    await expect(page.getByRole("status")).toContainText("15 sources");
    await expect(page.getByRole("article")).toHaveCount(12);
    await expect(page.locator("#pack-range")).toContainText("1 to 12 of 15");
    await page.getByRole("button", { name: "Next sources" }).click();
    await expect(page.getByRole("article")).toHaveCount(3);
    await expect(page.locator("#pack-sources-heading")).toBeFocused();
    await expect(page.getByRole("heading", { name: "Sample source 15" })).toBeVisible();
    await expect(page.locator("#pack-range")).toContainText("13 to 15 of 15");
    await expect(page.getByRole("article").getByRole("link")).toHaveCount(0);
    const all = await saveSelection(page, "en");
    expect(all.match(/^Source identifier: sample-\d{2}$/gmu)).toHaveLength(15);
    expect(all).toContain("Credit supplied by the file.");
    expect(all).not.toContain(privateName);
    expect(all).not.toContain("Example ·");
    expect(page.url()).not.toContain(privateName);
    await page.locator("#pack-language").click();
    await expect(page.locator("#pack-range")).toContainText("13 à 15 sur 15");
    await page.getByRole("button", { name: "Sources précédentes" }).click();
    await expect(page.getByRole("button", { name: "Sources précédentes" })).toBeDisabled();
    expect(outbound).toEqual([]);
  });

test("failed file replacement removes previous totals and allows the same filename to be corrected",
  async ({ readerOrigin, page }) => {
    await page.goto(readerOrigin + "pack-reader.html?lang=fr");
    await page.locator("#pack-example").click();
    const picker = page.locator("#pack-file");
    const file = { name: "manifest.json", mimeType: "application/json" };
    await picker.setInputFiles({ ...file, buffer: Buffer.from("{") });
    await expect(picker).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("alert")).toContainText("JSON");
    await expect(page.locator("#pack-results")).toBeHidden();
    await audit(page);
    await picker.setInputFiles({ ...file, buffer: Buffer.from(JSON.stringify(localManifest())) });
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(page.getByRole("alert")).toHaveText("");
    await expect(picker).not.toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#pack-origin")).not.toContainText("Exemple");
    await expect(page.getByRole("status")).toContainText("1 source");
  });

for (const appearance of ["dark", "forced contrast"] as const) {
  test(`French reader reflows with ${appearance}, readable notices and 44px targets`,
    async ({ readerOrigin, page }) => {
      await page.emulateMedia(appearance === "dark" ? { colorScheme: "dark" } : { forcedColors: "active" });
      await page.setViewportSize({ width: 320, height: 640 });
      await page.goto(readerOrigin + "pack-reader.html?lang=fr");
      await page.getByRole("button", { name: words.fr.sample }).click();
      await expect(page.getByRole("article")).toHaveCount(4);
      await measureControls(page);
      await audit(page);
    });
}
