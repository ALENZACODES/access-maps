import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const sourceFiles = new URL("../../docs/attribution/", import.meta.url);
const contentTypes: Record<string, string> = {
  css: "text/css; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  html: "text/html; charset=utf-8",
};
let origin: string;
const server = createServer(async (request, response) => {
  const path = new URL(request.url ?? "/", "http://localhost").pathname;
  const match = /^\/([a-z0-9-]+\.(html|mjs|css))$/u.exec(path);
  if (!match || request.method !== "GET") {
    response.writeHead(404).end();
    return;
  }
  try {
    const bytes = await readFile(new URL(match[1], sourceFiles));
    response.writeHead(200, { "Content-Type": contentTypes[match[2]] }).end(bytes);
  } catch {
    response.writeHead(404).end();
  }
});

test.beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject).listen(0, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
test.afterAll(async () => {
  if (server.listening) {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

const credit = "© OpenStreetMap contributors";
function catalog(languages: Array<"en" | "fr">) {
  return {
    schema: "map-notice-locale-parity/1", catalogId: "offline-review", label: "Catalogue",
    createdOn: "2026-11-21",
    entries: languages.map(locale => ({
      id: "entry-" + locale, pairId: "osm-credit", locale, kind: "provider-credit",
      text: credit, sourceId: "osm-source", licence: "ODbL", required: true, tokens: [],
      sourceUrl: "https://www.openstreetmap.org/copyright",
      licenceUrl: "https://opendatacommons.org/licenses/odbl/1-0/", notes: "",
    })),
  };
}

function upload(value: ReturnType<typeof catalog>) {
  return { name: "catalogue.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(value)) };
}

test("French fallback has a French document and correctly identified language passages with scripts disabled",
  async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto(origin + "/locale-parity.html?lang=fr");
      await expect(page.locator("html")).toHaveAttribute("lang", "fr");
      const french = page.getByText(/Activez JavaScript/u);
      const english = page.getByText(/Enable JavaScript/u);
      await expect(french).toBeVisible();
      await expect(english).toBeVisible();
      for (const [node, language] of [[french, "fr"], [english, "en"]] as const) {
        expect(await node.evaluate(el => el.closest("[lang]")?.getAttribute("lang"))).toBe(language);
      }
    } finally {
      await context.close();
    }
  });

for (const language of ["en", "fr"] as const) {
  test(`home link opens the ${language} reader with accessible controls and language switching`,
    async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 700 });
      await page.goto(origin + "/index.html");
      const link = page.locator(`a[href="locale-parity.html?lang=${language}"]`);
      await expect(link).toHaveAttribute("lang", language);
      await link.click();
      const selector = page.locator("#locale-parity-language");
      await expect(selector).toHaveValue(language);
      await expect(page.locator("html")).toHaveAttribute("lang", language);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(language === "fr"
        ? "Correspondance des mentions bilingues" : "Bilingual Notice Content & Locale Parity");
      await expect(page.getByRole("combobox", { name: language === "fr" ? "Langue" : "Language" })).toBeVisible();
      const axe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
      expect(axe.violations.map(v => v.id)).toEqual([]);
      const undersized = await page.locator("input,button,select,a[href]").evaluateAll(nodes =>
        nodes.filter(el => el.getClientRects().length > 0).flatMap(el => {
          const rect = el.getBoundingClientRect();
          return rect.width < 44 || rect.height < 44 ? [el.id || el.tagName] : [];
        }));
      expect(undersized).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
      const next = language === "en" ? "fr" : "en";
      await selector.focus();
      await selector.selectOption(next);
      await expect(page.locator("html")).toHaveAttribute("lang", next);
      await expect(selector).toHaveValue(next);
      await expect(selector).toBeFocused();
    });
}

test("French audit, missing translations, local upload and no-change comparison are localized offline",
  async ({ page, context }) => {
    await page.goto(origin + "/locale-parity.html?lang=fr");
    const status = page.getByRole("status");
    const audit = page.locator("#locale-parity-audit");
    const compare = page.locator("#locale-parity-compare");
    await audit.click();
    await expect(status).toHaveText("Chargez d’abord un catalogue.");
    await compare.click();
    await expect(status).toHaveText("Chargez d’abord les deux catalogues.");
    await context.setOffline(true);
    const current = page.locator("#locale-parity-file");
    const prior = page.locator("#locale-parity-previous-file");
    await current.setInputFiles(upload(catalog(["en"])));
    await expect(status).toContainText("chargé");
    await audit.click();
    const result = page.locator("#locale-parity-results");
    // Read textContent directly: Playwright's default whitespace normalisation
    // treats ordinary, narrow nonbreaking and nonbreaking spaces as equivalent.
    expect(await result.textContent()).toContain("Couverture des paires\u00a0: 0/1");
    expect(await result.textContent()).toContain("Mention française manquante\u00a0: osm-credit");
    expect(await result.textContent()).toContain("Décision d’examen\u00a0:");
    await current.setInputFiles(upload(catalog(["fr"])));
    await expect(status).toContainText("chargé");
    await audit.click();
    expect(await result.textContent()).toContain("Mention anglaise manquante\u00a0: osm-credit");
    await prior.setInputFiles(upload(catalog(["fr"])));
    await expect(status).toContainText("chargé");
    await compare.click();
    await expect(page.locator("#locale-parity-changes")).toContainText("Aucun changement");
    const visible = await page.locator("body").innerText();
    expect(visible).not.toMatch(/\b(?:No changes|Decision:|FR missing|EN missing|Load both|loaded|hold-for-review)\b/u);
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(axe.violations.map(v => v.id)).toEqual([]);
  });
