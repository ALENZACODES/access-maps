import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Master plan Day 17 audit of the journey result and accessible map
 * (packages/map-ui), in English and French, at phone width and desktop width. A Tab script visits every stop and checks visible focus
 * there. Every control is measured against WCAG 2.2 SC 2.5.8 (24 by 24 CSS
 * pixels), and its accessible name, read from Chrome's accessibility tree,
 * must contain its visible label (SC 2.5.3). axe runs on each screen.
 * The report is written to test-results/audit/shell-audit.json.
 * These checks do not prove WCAG 2.2 AA.
 */

const SCREENS = [
  { route: "/?lang=en", language: "en" as const },
  { route: "/?lang=fr", language: "fr" as const },
];
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
];
/** Build identifier: the commit under test. */
const BUILD_ID = process.env.BUILD_ID ?? execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
const TARGET_MIN_PX = 24;
const LIMITATION = "Automated checks find some failures. They do not prove WCAG 2.2 AA.";

type Language = "en" | "fr";

interface Failure {
  id: string;
  severity: "blocker" | "serious" | "minor";
  screen: string;
  language: Language;
  criterion: string;
  reproduction: string[];
  observed: string;
}

interface Control {
  screen: string;
  language: Language;
  control: string;
  width: number;
  height: number;
  inline: boolean;
  targetOk: boolean;
  singleActivation: boolean;
  focusVisible: boolean | null;
  labelInName: boolean | null;
}

function tidy(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\p{P}\s]+|[\p{P}\s]+$/gu, "")
    .toLocaleLowerCase();
}

/** Marks every visible control and returns its size, label, and whether it is a native single-activation control. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const selector = "a[href], button, input:not([type='hidden']), select, textarea, summary, [tabindex]:not([tabindex='-1'])";
    return Array.from(document.querySelectorAll<HTMLElement>(selector))
      .filter((el) => {
        const box = el.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== "hidden" && !el.closest("[aria-hidden='true']");
      })
      .map((el, index) => {
        el.dataset.auditIdx = String(index);
        const box = el.getBoundingClientRect();
        const tag = el.tagName.toLowerCase();
        const field = el as HTMLInputElement;
        let label = "";
        if (tag === "a" || tag === "button" || tag === "summary") label = el.innerText;
        else if (tag === "input" || tag === "select" || tag === "textarea") label = field.labels?.[0]?.innerText ?? "";
        // WCAG 2.5.8 counts the whole area that activates the control. When the input sits inside its
        // own label (React Aria radios and checkboxes), clicking the label activates it, so the label is the target.
        const wrapping = field.labels ? Array.from(field.labels).find((item) => item.contains(el)) : undefined;
        const hitBox = wrapping ? wrapping.getBoundingClientRect() : box;
        const parentText = (el.parentElement?.innerText ?? "").replace(/\s+/g, " ").trim();
        const ownText = (el.innerText ?? "").replace(/\s+/g, " ").trim();
        return {
          index,
          tag,
          disabled: (el as HTMLButtonElement).disabled === true || el.getAttribute("aria-disabled") === "true",
          label: label.replace(/\s+/g, " ").trim(),
          width: Math.round(hitBox.width * 10) / 10,
          height: Math.round(hitBox.height * 10) / 10,
          inline: tag === "a" && getComputedStyle(el).display === "inline" && parentText.length > ownText.length + 10,
          native: ["a", "button", "input", "select", "textarea", "summary"].includes(tag) && !el.hasAttribute("ondblclick") && el.getAttribute("draggable") !== "true",
        };
      });
  });
}

async function names(page: Page, count: number): Promise<string[]> {
  const cdp = await page.context().newCDPSession(page);
  const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
  const out: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: `[data-audit-idx="${index}"]` });
    if (!nodeId) {
      out.push("");
      continue;
    }
    const tree = await cdp.send("Accessibility.getPartialAXTree", { nodeId, fetchRelatives: false });
    const node = tree.nodes.find((item) => !item.ignored) ?? tree.nodes[0];
    out.push(String(node?.name?.value ?? ""));
  }
  await cdp.detach();
  return out;
}

/** Tabs through the page. For each stop, records whether its look differs from when it is not focused. */
async function tabScript(page: Page) {
  const focus = new Map<string, boolean>();
  let firstStop = "";
  let previous = "";
  let same = 0;
  for (let press = 0; press < 200; press += 1) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const look = () => {
        const style = getComputedStyle(el);
        return [style.outlineStyle, style.outlineWidth, style.outlineColor, style.boxShadow, style.borderColor, style.backgroundColor, style.color, style.textDecorationLine].join("|");
      };
      const style = getComputedStyle(el);
      const ring = style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2;
      const focused = look();
      const clone = el.cloneNode(true) as HTMLElement;
      clone.removeAttribute("id");
      clone.setAttribute("aria-hidden", "true");
      clone.tabIndex = -1;
      clone.style.position = "absolute";
      clone.style.left = "-9999px";
      el.parentElement?.appendChild(clone);
      const s = getComputedStyle(clone);
      const resting = [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderColor, s.backgroundColor, s.color, s.textDecorationLine].join("|");
      clone.remove();
      return { idx: el.dataset.auditIdx ?? `x${el.tagName}`, name: (el.innerText || el.getAttribute("aria-label") || el.tagName).replace(/\s+/g, " ").trim(), visible: ring || focused !== resting };
    });
    if (!stop) break;
    if (!firstStop) firstStop = stop.name;
    same = stop.idx === previous ? same + 1 : 0;
    if (same >= 2) return { firstStop, stops: focus.size, noTrap: false, focus };
    previous = stop.idx;
    if (focus.has(stop.idx)) break;
    focus.set(stop.idx, stop.visible);
  }
  return { firstStop, stops: focus.size, noTrap: true, focus };
}

function criterionFromTags(tags: string[]): string {
  for (const tag of tags) {
    const match = /^wcag(\d)(\d)(\d{1,2})$/.exec(tag);
    if (match) return `${match[1]}.${match[2]}.${match[3]}`;
  }
  return "best-practice";
}

test("Day 17: the journey result and map are audited in English and French", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const failures: Failure[] = [];
  const controls: Control[] = [];
  const screens: Array<{ route: string; language: Language; viewport: string; firstStop: string; stops: number; noTrap: boolean; axe: string[] }> = [];
  const fail = (failure: Omit<Failure, "id">) => failures.push({ ...failure, id: `F${failures.length + 1}` });

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    const size = `${viewport.width} by ${viewport.height}`;
    for (const { route, language } of SCREENS) {
      await page.goto(route);
      await expect(page.locator("html")).toHaveAttribute("lang", language);
      await expect(page.locator("[data-map-ready='true']").first()).toBeAttached({ timeout: 15_000 });
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      const raw = await measure(page);
      const accessible = await names(page, raw.length);
      const keyboard = await tabScript(page);
      const where = (what: string) => [`Open ${route} at ${size}.`, `Find ${what}.`];
      if (!keyboard.noTrap) fail({ severity: "blocker", screen: route, language, criterion: "2.1.2", reproduction: where("the focused control"), observed: "Focus stayed on one control for three Tab presses." });
      if (keyboard.stops === 0) fail({ severity: "blocker", screen: route, language, criterion: "2.1.1", reproduction: where("any control"), observed: "Tab reached no control." });
      for (const item of raw) {
        if (item.disabled) continue;
        const name = accessible[item.index] ?? "";
        const label = `${item.tag}: ${item.label || name}`.slice(0, 100);
        const targetOk = item.inline || (item.width >= TARGET_MIN_PX && item.height >= TARGET_MIN_PX);
        const focusVisible = keyboard.focus.has(String(item.index)) ? keyboard.focus.get(String(item.index)) ?? false : null;
        const labelInName = item.label ? tidy(name).includes(tidy(item.label)) : null;
        controls.push({ screen: `${route} ${size}`, language, control: label, width: item.width, height: item.height, inline: item.inline, targetOk, singleActivation: item.native, focusVisible, labelInName });
        if (!targetOk) fail({ severity: "serious", screen: route, language, criterion: "2.5.8", reproduction: where(label), observed: `Target is ${item.width} by ${item.height} CSS pixels.` });
        if (focusVisible === false) fail({ severity: "serious", screen: route, language, criterion: "2.4.7", reproduction: [...where(label), "Reach it with Tab."], observed: "No visible change when focused." });
        if (labelInName === false) fail({ severity: "serious", screen: route, language, criterion: "2.5.3", reproduction: where(label), observed: `Accessible name "${name}" does not contain the visible label "${item.label}".` });
        if (!item.native) fail({ severity: "serious", screen: route, language, criterion: "2.1.1", reproduction: where(label), observed: "Not a native control, so single activation by key and tap is not guaranteed." });
      }
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      for (const violation of axe.violations) {
        fail({
          severity: violation.impact === "critical" ? "blocker" : "serious",
          screen: route,
          language,
          criterion: criterionFromTags(violation.tags),
          reproduction: [`Open ${route} at ${size}.`, `Run axe. Target: ${violation.nodes[0]?.target.join(" ") ?? "page"}.`],
          observed: `${violation.id}: ${violation.help}`,
        });
      }
      screens.push({ route, language, viewport: size, firstStop: keyboard.firstStop, stops: keyboard.stops, noTrap: keyboard.noTrap, axe: axe.violations.map((violation) => violation.id) });
    }
  }

  const report = { schemaVersion: "audit-report-1.0.0", buildId: BUILD_ID, ranAt: new Date().toISOString(), screens, controls, failures, limitation: LIMITATION };
  const dir = resolve(import.meta.dirname, "../test-results/audit");
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, "map-audit.json");
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  await testInfo.attach("map-audit.json", { path: file, contentType: "application/json" });

  expect(report.buildId).not.toBe("");
  expect(screens).toHaveLength(SCREENS.length * VIEWPORTS.length);
  for (const row of screens) expect(row.noTrap, `${row.route} ${row.viewport}`).toBe(true);
  expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
  expect(controls.filter((control) => control.targetOk && control.singleActivation && control.focusVisible === true).length).toBeGreaterThanOrEqual(10);
  expect(controls.filter((control) => control.labelInName === true).length).toBeGreaterThanOrEqual(10);
});

test("Day 17: after results load, the first Tab reaches the 911 link in English and French", async ({ page }) => {
  for (const { route, language } of SCREENS) {
    await page.goto(route);
    await expect(page.locator("[data-map-ready='true']").first()).toBeAttached({ timeout: 15_000 });
    const heading = page.locator(".journey-result h2").first();
    await expect(heading, `${language}: focus lands on the results heading`).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus"), language).toHaveAttribute("href", "tel:911");
  }
});
