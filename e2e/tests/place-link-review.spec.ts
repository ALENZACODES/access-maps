import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const cli = fileURLToPath(new URL("../../tools/data-qa/place-link-review/cli.ts", import.meta.url));
const fixture = new URL("../../tools/data-qa/place-link-review/fixture.ts", import.meta.url).href;
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
let workspace: string;

function launch(arguments_: string[]): string {
  return execFileSync(process.execPath, ["--experimental-strip-types", ...arguments_], {
    cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
}

test.beforeAll(() => {
  workspace = mkdtempSync(join(tmpdir(), "place-link-reader-"));
  // The actual release reader runs as a native Node process. Supply its offline
  // fixture via the same runtime, independent of Playwright's TypeScript loader.
  launch(["--input-type=module", "--eval",
    "const {writeReviewFixture} = await import(process.argv[1]); await writeReviewFixture(process.argv[2]);",
    fixture, workspace]);
  // Stage the publisher's real per-cell projections. The package producer
  // resolves the repository's TypeScript .js imports through its usual loader.
  launch(["--import", "tsx", "--input-type=module", "--eval", `
    import { readFile } from "node:fs/promises";
    import { join } from "node:path";
    import { stageReviewPack } from "./test/places/stage-review-pack.ts";
    import { readSnapshot } from "./tools/data-qa/place-link-review/snapshot.ts";
    import { readProvenance } from "./tools/data-qa/place-link-review/provenance.ts";
    const root = join(process.argv[1], "after");
    const data = join(root, "data");
    const registry = readProvenance(JSON.parse(await readFile(join(root, "sources/registry.json"), "utf8")));
    await stageReviewPack(data, join(root, "pack", "v1"), await readSnapshot(data), registry);
  `, workspace]);
});
test.afterAll(() => { if (workspace) rmSync(workspace, { recursive: true, force: true }); });

function compare(format: string, lang: string, extra: string[] = []): string {
  return launch([cli, "--previous", join(workspace, "before"), "--candidate", join(workspace, "after"),
    "--pack", join(workspace, "after", "pack", "v1"), "--format", format, "--lang", lang, ...extra]);
}

async function keyboardTo(page: Page, locator: Locator) {
  // Test the actual document order; a control focused with the DOM API can
  // otherwise look keyboard-accessible even when it has tabindex=-1.
  for (let i = 0; i < 55; i++) {
    if (await locator.evaluate(node => document.activeElement === node)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error("The requested control is outside the Tab order.");
}

async function focusRing(control: Locator): Promise<void> {
  await expect(control).toBeFocused();
  await expect(control).toBeInViewport();
  expect(await control.evaluate(node => {
    const style = getComputedStyle(node);
    return node.matches(":focus-visible") && style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2;
  })).toBe(true);
}

async function checkTargets(page: Page): Promise<void> {
  const violations = await page.locator("summary, button, input, select, a[href]").evaluateAll(nodes => {
    return nodes.flatMap(node => {
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return [];
      if (rect.width >= 44 && rect.height >= 44) return [];
      return [{ name: node.tagName + "#" + node.id, width: rect.width, height: rect.height }];
    });
  });
  expect(violations).toEqual([]);
}

for (const lang of ["en", "fr"] as const) {
  for (const width of [390, 1280]) {
    test(`operates a local place-link review in ${lang} at ${width}px`, async ({ page, context }, testInfo) => {
      const html = testInfo.outputPath("review.html");
      compare("html", lang, ["--out", html]);
      const remoteRequests: string[] = [];
      const scriptErrors: string[] = [];
      page.on("request", req => { if (/^https?:/u.test(req.url())) remoteRequests.push(req.url()); });
      page.on("pageerror", error => scriptErrors.push(error.message));
      await context.setOffline(true);
      await page.setViewportSize({ width, height: 844 });
      await page.goto(pathToFileURL(html).href);
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.locator("#pack").getByRole("heading", { level: 2 })).toBeVisible();
      await expect(page.locator("#pack summary")).toHaveCount(2);
      const status = page.locator("#ui-status");
      const search = page.getByRole("searchbox", {
        name: lang === "fr" ? "Rechercher dans cette page" : "Search this page",
      });
      const cases = page.locator("details[data-case]:visible");
      const total = await cases.count();
      expect(total).toBeGreaterThan(2);
      await expect(status).toHaveAttribute("aria-live", "polite");
      await page.keyboard.press("Tab");
      await focusRing(page.locator("#skip"));
      await page.keyboard.press("Enter");
      await expect(page.locator("#results")).toBeFocused();

      await keyboardTo(page, search);
      await focusRing(search);
      await page.keyboard.type("fixture-alpha:split");
      await expect(cases).toHaveCount(1);
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.type("absent identifier with no matching declaration");
      await expect(cases).toHaveCount(0);
      await expect(search).toBeFocused();
      const clear = page.locator("#clear-filters");
      await keyboardTo(page, clear);
      await page.keyboard.press("Enter");
      await expect(cases).toHaveCount(total);
      await expect(search).toHaveValue("");

      const firstCase = cases.first();
      const id = await firstCase.getAttribute("data-case");
      const fingerprint = await firstCase.getAttribute("data-fingerprint");
      expect(id).toMatch(/^[0-9a-f]{64}$/u);
      expect(fingerprint).toMatch(/^[0-9a-f]{64}$/u);
      const summary = firstCase.locator("summary");
      await keyboardTo(page, summary);
      await focusRing(summary);
      await page.keyboard.press("Enter");
      await expect(firstCase).toHaveAttribute("open", "");
      const decision = firstCase.getByRole("combobox", {
        name: lang === "fr" ? "Décision d’examen" : "Review decision",
      });
      await keyboardTo(page, decision);
      await focusRing(decision);
      await page.keyboard.press("End");
      await expect(decision).toHaveValue("reviewed");

      const filter = page.locator("#decision-filter");
      await keyboardTo(page, filter);
      await filter.selectOption("reviewed");
      await expect(cases).toHaveCount(1);
      await expect(cases.first()).toHaveAttribute("data-case", id!);
      await expect(filter).toBeFocused();
      // Moving a case out of the current state filter hides the focused control.
      // The reviewer must be able to continue from a visible keyboard stop.
      await keyboardTo(page, decision);
      await page.keyboard.press("Home");
      await expect(cases).toHaveCount(0);
      await expect(filter).toBeFocused();
      await expect(status).toContainText("0");
      await filter.selectOption("");
      const editedCase = page.locator(`details[data-case="${id}"]`);
      const editedDecision = editedCase.locator("select[data-decision]");
      await keyboardTo(page, editedDecision);
      await page.keyboard.press("End");
      await expect(editedDecision).toHaveValue("reviewed");
      // Exercise every visible data state, including provenance details that
      // are initially collapsed. This exposes long source and digest values.
      await page.locator("details").evaluateAll(elements => {
        for (const element of elements) if (element instanceof HTMLDetailsElement) element.open = true;
      });
      await checkTargets(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const axe = await new AxeBuilder({ page }).withTags(tags).analyze();
      expect(axe.violations.map(result => ({ id: result.id, targets: result.nodes.map(node => node.target) }))).toEqual([]);

      const exportButton = page.getByRole("button", { name: lang === "fr" ? "Exporter les décisions" : "Export decisions" });
      await keyboardTo(page, exportButton);
      await focusRing(exportButton);
      const pending = page.waitForEvent("download");
      await page.keyboard.press("Enter");
      const download = await pending;
      expect(download.suggestedFilename()).toBe("place-link-decisions.json");
      const saved = testInfo.outputPath("decisions.json");
      await download.saveAs(saved);
      expect(JSON.parse(readFileSync(saved, "utf8"))).toEqual({
        schema: "place-link-decisions/v1", entries: [{ id, fingerprint, decision: "reviewed" }],
      });
      const restored = JSON.parse(compare("json", lang, ["--decisions", saved])) as {
        cases: Array<{ id: string; state: string }>;
      };
      expect(restored.cases.find(item => item.id === id)?.state).toBe("reviewed");
      expect(remoteRequests).toEqual([]);
      expect(scriptErrors).toEqual([]);
    });
  }
}
