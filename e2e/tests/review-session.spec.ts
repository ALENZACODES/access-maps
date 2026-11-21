import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { renderAudit, renderDesk, type Language } from "../../tools/data-qa/p15aa-session/report.js";
import { auditSession, reviewerDesk, submitResponse } from "../../tools/data-qa/p15aa-session/session.js";
import { sessionExample } from "../../tools/data-qa/p15aa-session/test-data.js";

const wcag = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];
const labels = {
  en: {
    skip: "Skip to cases", main: "Cases", unknown: "Unknown", desk: "Independent review",
    audit: "Review session audit", field: "1. Wheelchair access", group: "Record a response",
    ready: "Ready for the next review stage", hold: "Hold for review", save: "Save response file",
    status: "Response file prepared. Return it to the coordinator.", history: "Decision history",
    disputed: "In dispute", adjudicator: "Adjudicator", ruling: "Independent ruling",
  },
  fr: {
    skip: "Aller aux dossiers", main: "Dossiers", unknown: "Inconnu", desk: "Révision indépendante",
    audit: "Journal de la séance de révision", field: "1. Accès en fauteuil roulant",
    group: "Consigner une réponse", ready: "Prêt pour l’étape de révision suivante",
    hold: "Mettre en attente pour révision", save: "Enregistrer le fichier de réponse",
    status: "Fichier de réponse préparé. Transmettez-le à la personne qui coordonne la séance.",
    history: "Historique des décisions", disputed: "En désaccord", adjudicator: "Responsable de l’arbitrage",
    ruling: "Arbitrage indépendant",
  },
};

async function openFile(page: Page, info: TestInfo, filename: string, html: string) {
  const path = info.outputPath(filename);
  await writeFile(path, html);
  await page.goto(pathToFileURL(path).href);
}

async function pageChecks(page: Page, language: Language, title: string) {
  const text = labels[language];
  await expect(page).toHaveTitle(title);
  await expect(page.locator("html")).toHaveAttribute("lang", language);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  const main = page.getByRole("main", { name: text.main });
  await expect(main.getByRole("heading", { level: 2, name: text.field })).toHaveCount(1);
  await expect(main.getByText(text.unknown, { exact: true })).toBeVisible();
  await expect(main.getByText("© OpenStreetMap contributors", { exact: true })).toBeVisible();
  await expect(main.getByText("ODbL-1.0", { exact: true })).toBeVisible();
  const content = await page.locator("body").innerText();
  if (language === "fr") {
    expect(content).not.toMatch(/[^\u00a0][:?!]|«[^\u00a0]|[^\u00a0]»/u);
  }
  const metrics = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.width);
  const script = await page.locator("script").textContent();
  const digest = createHash("sha256").update(script!).digest("base64");
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(policy?.split(";").map(directive => directive.trim())).toEqual(expect.arrayContaining([
    "default-src 'none'", "script-src 'sha256-" + digest + "'", "form-action 'none'", "base-uri 'none'",
  ]));
  const targets = await page.locator("a[href],button,summary,select,input:not([type=hidden])").evaluateAll(nodes =>
    nodes.flatMap(node => {
      // Native associated labels activate radios across the entire label.
      const target = node instanceof HTMLInputElement ? node.labels?.item(0) : node;
      const rect = target?.getBoundingClientRect();
      return !rect || rect.height < 44 || rect.width < 44 ? [node.outerHTML] : [];
    }),
  );
  expect(targets).toEqual([]);
}

async function visibleFocus(target: Locator) {
  await expect(target).toBeFocused();
  await expect(target).toBeInViewport();
  expect(await target.evaluate(node => {
    const painted = node instanceof HTMLInputElement ? [node, ...(node.labels ?? [])] : [node];
    return node.matches(":focus-visible") && painted.some(el => {
      const style = getComputedStyle(el);
      return style.outlineStyle === "solid" && Number.parseFloat(style.outlineWidth) >= 2;
    });
  })).toBe(true);
}

async function enterCases(page: Page, language: Language) {
  await page.keyboard.press("Tab");
  await visibleFocus(page.getByRole("link", { name: labels[language].skip }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main", { name: labels[language].main })).toBeFocused();
}

async function keyboardSave(page: Page, lang: Language, info: TestInfo, filename: string) {
  const button = page.getByRole("button", { name: labels[lang].save });
  await page.keyboard.press("Tab");
  await visibleFocus(button);
  const pending = page.waitForEvent("download");
  await page.keyboard.press("Enter");
  const download = await pending;
  expect(download.suggestedFilename()).toBe(filename);
  const path = info.outputPath(filename);
  await download.saveAs(path);
  await expect(page.getByRole("status")).toHaveText(labels[lang].status);
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function accessAudit(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(wcag).analyze();
  expect(result.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
}

function inputVote(state: ReturnType<typeof sessionExample>, actor: string, choice: "ready" | "hold") {
  const desk = reviewerDesk(state.evidence, state.file, actor);
  const row = desk.cases[0]!;
  const payload = {
    sessionId: desk.sessionId, caseId: row.evidence.id, actor, revision: row.revision,
    previous: row.previous, kind: "vote", choice,
  };
  return { ...state, file: submitResponse(state.evidence, state.file, payload) };
}

for (const lang of ["en", "fr"] as const) {
  for (const width of [320, 1280]) {
    test(`offline review, dispute and independent ruling in ${lang} at ${width} CSS pixels`, async ({ page, context }, info) => {
      const text = labels[lang];
      const initial = sessionExample();
      const { evidence, file } = inputVote(initial, "r-002", "ready");
      const desk = reviewerDesk(evidence, file, "r-001");
      const before = renderDesk(reviewerDesk(initial.evidence, initial.file, "r-001"), lang);
      const html = renderDesk(desk, lang);
      // The entire delivered file, including hidden inputs, is unchanged when
      // another reviewer votes. No identifier, receipt or choice leaks.
      expect(html).toBe(before);
      expect(html).not.toContain("r-002");
      const requests: string[] = [];
      const errors: string[] = [];
      context.on("request", req => { if (/^(?:https?|wss?):/u.test(req.url())) requests.push(req.url()); });
      page.on("pageerror", error => errors.push(error.message));
      await context.setOffline(true);
      await page.setViewportSize({ width, height: 850 });
      await openFile(page, info, "reviewer-desk.html", html);
      await pageChecks(page, lang, text.desk);
      const form = page.getByRole("group", { name: text.group });
      const tree = await form.ariaSnapshot();
      for (const name of [text.group, text.ready, text.hold, text.save]) expect(tree).toContain(name);
      await accessAudit(page);
      await enterCases(page, lang);
      await page.keyboard.press("Tab");
      await visibleFocus(form.getByRole("radio", { name: text.ready, exact: true }));
      await page.keyboard.press("Space");
      await page.keyboard.press("ArrowDown");
      const hold = form.getByRole("radio", { name: text.hold, exact: true });
      await visibleFocus(hold);
      await expect(hold).toBeChecked();
      const row = desk.cases[0]!;
      const vote = await keyboardSave(page, lang, info, "response-" + row.evidence.id + "-r-001.json");
      expect(vote).toEqual({
        sessionId: file.sessionId, actor: "r-001", caseId: row.evidence.id, revision: row.revision,
        previous: row.previous, kind: "vote", choice: "hold",
      });
      const split = submitResponse(evidence, file, vote);
      const report = auditSession(evidence, split);
      expect(report.cases[0]?.outcome).toBe("disputed");
      await openFile(page, info, "coordinator-audit.html", renderAudit(report, lang));
      await pageChecks(page, lang, text.audit);
      await expect(page.getByText(text.disputed, { exact: true })).toBeVisible();
      await enterCases(page, lang);
      const history = page.getByText(text.history, { exact: true });
      await page.keyboard.press("Tab");
      await visibleFocus(history);
      await page.keyboard.press("Enter");
      await expect(page.getByRole("listitem")).toHaveCount(2);
      await expect(page.getByRole("listitem").nth(0)).toContainText("r-002");
      await expect(page.getByRole("listitem").nth(1)).toContainText("r-001");
      const adjudication = page.getByRole("group", { name: text.ruling });
      const select = adjudication.getByRole("combobox", { name: text.adjudicator });
      await page.keyboard.press("Tab");
      await visibleFocus(select);
      await page.keyboard.press("End");
      await expect(select).toHaveValue("r-003");
      await page.keyboard.press("Tab");
      const ready = adjudication.getByRole("radio", { name: text.ready, exact: true });
      await visibleFocus(ready);
      await page.keyboard.press("Space");
      await expect(ready).toBeChecked();
      await accessAudit(page);
      const ruling = await keyboardSave(page, lang, info, "response-" + row.evidence.id + "-r-003.json");
      expect(ruling).toEqual({
        sessionId: file.sessionId, actor: "r-003", caseId: row.evidence.id, revision: row.revision,
        previous: report.cases[0]!.historyHead, kind: "adjudicate", choice: "ready",
      });
      const finished = submitResponse(evidence, split, ruling);
      const finalAudit = auditSession(evidence, finished);
      expect(finalAudit.cases[0]).toMatchObject({
        outcome: "ready",
        ballot: { adjudicated: true },
        evidence: { state: "unknown", value: "UNKNOWN" },
      });
      const closed = renderDesk(reviewerDesk(evidence, finished, "r-001"), lang);
      await openFile(page, info, "closed-desk.html", closed);
      await expect(page.getByRole("button")).toHaveCount(0);
      await expect(page.getByText(text.unknown, { exact: true })).toBeVisible();
      expect(requests).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}
