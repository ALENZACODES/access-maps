/** Bilingual, offline-safe presentation of declared language-pair evidence. */
import type { OfflineBundle } from "./offline-bundle.js";
import type { ParityPlan, ParityResult, ParityFinding, PairSummary } from "./offline-parity.js";
import type { ParityChange, ParityComparison } from "./offline-parity-change.js";

export type ParityLocale = "en" | "fr";
export interface ParityRenderedReport {
  readonly locale: ParityLocale;
  readonly text: string;
  readonly html: string;
  readonly json: string;
}
interface Copy {
  readonly title: string;
  readonly release: string;
  readonly status: string;
  readonly blocked: string;
  readonly ready: string;
  readonly pairs: string;
  readonly findings: string;
  readonly changes: string;
  readonly noFindings: string;
  readonly noChanges: string;
  readonly enRoute: string;
  readonly frRoute: string;
  readonly sourceIds: string;
  readonly sharedAssets: string;
  readonly englishAssets: string;
  readonly frenchAssets: string;
  readonly unknown: string;
  readonly source: string;
  readonly licence: string;
  readonly datasetDate: string;
  readonly termsDate: string;
  readonly acquisition: string;
  readonly permission: string;
  readonly attribution: string;
  readonly sourceUrl: string;
  readonly licenceUrl: string;
  readonly evidence: string;
  readonly dates: string;
  readonly problem: string;
  readonly location: string;
  readonly detail: string;
  readonly severity: string;
  readonly blocking: string;
  readonly attention: string;
  readonly earlier: string;
  readonly later: string;
  readonly missing: string;
  readonly assets: string;
  readonly intro: string;
  readonly notice: string;
  readonly skip: string;
  readonly print: string;
}
const EN: Copy = {
  title: "Bilingual publication parity", release: "Release", status: "Status", blocked: "Publication blocked",
  ready: "No blocking findings in supplied records", pairs: "Language pairs", findings: "Findings",
  changes: "Release changes", noFindings: "No findings", noChanges: "No changes",
  enRoute: "English route", frRoute: "French route", sourceIds: "Declared sources",
  sharedAssets: "Shared assets", englishAssets: "English assets", frenchAssets: "French assets",
  unknown: "UNKNOWN", source: "Source", licence: "Licence", datasetDate: "Dataset date",
  termsDate: "Terms reviewed", acquisition: "Acquisition date", permission: "Redistribution permission",
  attribution: "Attribution", sourceUrl: "Source URL", licenceUrl: "Licence URL",
  evidence: "Evidence", dates: "Dates", problem: "Finding", location: "Location",
  detail: "Detail", severity: "Severity", blocking: "Blocking", attention: "Notice",
  earlier: "Before", later: "After", missing: "Not recorded", assets: "Assets",
  intro: "Only explicitly declared language pairs are compared. Missing evidence stays UNKNOWN.",
  notice: "These checks evaluate recorded evidence, not conditions at a destination.",
  skip: "Skip to main content", print: "Print report",
};
const FR: Copy = {
  title: "Correspondance des publications bilingues", release: "Version", status: "État",
  blocked: "Publication bloquée", ready: "Aucun élément bloquant dans les renseignements fournis",
  pairs: "Paires linguistiques", findings: "Points à examiner", changes: "Changements entre versions",
  noFindings: "Aucun point à signaler", noChanges: "Aucun changement",
  enRoute: "Vue en anglais", frRoute: "Vue en français", sourceIds: "Sources déclarées",
  sharedAssets: "Fichiers partagés", englishAssets: "Fichiers en anglais",
  frenchAssets: "Fichiers en français", unknown: "UNKNOWN", source: "Source",
  licence: "Licence", datasetDate: "Données en date du", termsDate: "Conditions consultées le",
  acquisition: "Date d’acquisition", permission: "Permission de redistribution",
  attribution: "Mention de source", sourceUrl: "Adresse de la source",
  licenceUrl: "Adresse de la licence", evidence: "Renseignements",
  dates: "Dates", problem: "Point à examiner", location: "Emplacement",
  detail: "Détail", severity: "Importance", blocking: "Bloquant", attention: "À examiner",
  earlier: "Avant", later: "Après", missing: "Non indiqué", assets: "Fichiers",
  intro: "Seules les paires explicitement déclarées sont comparées. Les renseignements manquants restent UNKNOWN.",
  notice: "Ces contrôles portent sur les renseignements déclarés, non sur l’état d’un lieu.",
  skip: "Aller au contenu principal", print: "Imprimer le rapport",
};
function copy(locale: ParityLocale): Copy { return locale === "fr" ? FR : EN; }
function value(text: string | number | undefined): string { return text === undefined ? "UNKNOWN" : String(text); }
function escapeHtml(text: string): string {
  return text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;").replace(/'/gu, "&#39;");
}
function frenchColon(locale: ParityLocale): string { return locale === "fr" ? "\u00a0: " : ": "; }
function line(locale: ParityLocale, label: string, content: string | number): string {
  return `${label}${frenchColon(locale)}${content}`;
}
function htmlDetail(label: string, content: string | number): string {
  return `<div class="detail"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value(content))}</dd></div>`;
}
function htmlList(items: readonly string[], empty: string): string {
  if (!items.length) return `<p>${escapeHtml(empty)}</p>`;
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}
function textList(items: readonly string[], empty: string): string {
  return items.length ? items.map((item) => `  - ${item}`).join("\n") : `  ${empty}`;
}
function sourceText(bundle: OfflineBundle, sourceIds: readonly string[], locale: ParityLocale): string[] {
  const c = copy(locale);
  const sources = new Map(bundle.release.sources.map((source) => [source.id, source]));
  const lines: string[] = [];
  for (const id of sourceIds) {
    const source = sources.get(id);
    if (!source) { lines.push(line(locale, c.source, `${id} (UNKNOWN)`)); continue; }
    lines.push(line(locale, c.source, `${id} — ${source.name}`));
    lines.push(line(locale, c.licence, source.licenceName));
    lines.push(line(locale, c.permission, source.redistributionPermission));
    lines.push(line(locale, c.sourceUrl, source.sourceUrl));
    lines.push(line(locale, c.licenceUrl, source.licenceUrl));
    lines.push(line(locale, c.datasetDate, source.datasetDate));
    lines.push(line(locale, c.acquisition, source.acquisitionDate));
    lines.push(line(locale, c.termsDate, source.termsReviewedDate));
    lines.push(line(locale, c.attribution, source.attribution || "UNKNOWN"));
  }
  return lines;
}
function sourceHtml(bundle: OfflineBundle, sourceIds: readonly string[], locale: ParityLocale): string {
  const c = copy(locale);
  const sources = new Map(bundle.release.sources.map((source) => [source.id, source]));
  return sourceIds.map((id) => {
    const source = sources.get(id);
    if (!source) return `<section><h4>${escapeHtml(id)}</h4><p>UNKNOWN</p></section>`;
    return `<section class="source"><h4>${escapeHtml(source.name)}</h4><dl>` +
      htmlDetail(c.source, id) + htmlDetail(c.licence, source.licenceName) +
      htmlDetail(c.permission, source.redistributionPermission) +
      htmlDetail(c.sourceUrl, source.sourceUrl) + htmlDetail(c.licenceUrl, source.licenceUrl) +
      htmlDetail(c.datasetDate, source.datasetDate) + htmlDetail(c.acquisition, source.acquisitionDate) +
      htmlDetail(c.termsDate, source.termsReviewedDate) +
      htmlDetail(c.attribution, source.attribution || "UNKNOWN") + "</dl></section>";
  }).join("");
}
function summaryText(summary: PairSummary, bundle: OfflineBundle, locale: ParityLocale): string[] {
  const c = copy(locale);
  return [
    `## ${summary.id}`,
    line(locale, c.status, summary.ready ? c.ready : c.blocked),
    line(locale, c.enRoute, summary.enRouteId), line(locale, c.frRoute, summary.frRouteId),
    line(locale, c.sourceIds, summary.expectedSourceIds.join(", ") || "UNKNOWN"),
    `${c.sharedAssets}${frenchColon(locale)}\n${textList(summary.sharedAssetPaths, c.missing)}`,
    `${c.englishAssets}${frenchColon(locale)}\n${textList(summary.enAssetPaths, c.missing)}`,
    `${c.frenchAssets}${frenchColon(locale)}\n${textList(summary.frAssetPaths, c.missing)}`,
    ...sourceText(bundle, summary.expectedSourceIds, locale),
  ];
}
function summaryHtml(summary: PairSummary, bundle: OfflineBundle, locale: ParityLocale): string {
  const c = copy(locale);
  return `<section class="pair" aria-labelledby="pair-${escapeHtml(summary.id)}"><h3 id="pair-${escapeHtml(summary.id)}">${escapeHtml(summary.id)}</h3><dl>` +
    htmlDetail(c.status, summary.ready ? c.ready : c.blocked) +
    htmlDetail(c.enRoute, summary.enRouteId) + htmlDetail(c.frRoute, summary.frRouteId) +
    "</dl>" + `<h4>${escapeHtml(c.sourceIds)}</h4>` + htmlList(summary.expectedSourceIds, c.unknown) +
    `<h4>${escapeHtml(c.sharedAssets)}</h4>` + htmlList(summary.sharedAssetPaths, c.unknown) +
    `<h4>${escapeHtml(c.englishAssets)}</h4>` + htmlList(summary.enAssetPaths, c.unknown) +
    `<h4>${escapeHtml(c.frenchAssets)}</h4>` + htmlList(summary.frAssetPaths, c.unknown) +
    sourceHtml(bundle, summary.expectedSourceIds, locale) + "</section>";
}
function findingText(finding: ParityFinding, locale: ParityLocale): string {
  const c = copy(locale);
  return `${finding.level === "block" ? c.blocking : c.attention} [${finding.code}] ${finding.pairId ?? "UNKNOWN"} / ${finding.path}: ${finding.detail}`;
}
function findingHtml(finding: ParityFinding, locale: ParityLocale): string {
  const c = copy(locale);
  return `<li><strong>${escapeHtml(finding.level === "block" ? c.blocking : c.attention)}</strong> ` +
    `<code>${escapeHtml(finding.code)}</code> <span>${escapeHtml(finding.pairId ?? "UNKNOWN")}</span>` +
    `<p>${escapeHtml(finding.path)}</p><p>${escapeHtml(finding.detail)}</p></li>`;
}
function changeText(change: ParityChange, locale: ParityLocale): string {
  const c = copy(locale);
  return `${change.level === "block" ? c.blocking : c.attention} [${change.kind}] ${change.entity}\n  ${line(locale, c.earlier, change.before)}\n  ${line(locale, c.later, change.after)}`;
}
function changeHtml(change: ParityChange, locale: ParityLocale): string {
  const c = copy(locale);
  return `<li><strong>${escapeHtml(change.level === "block" ? c.blocking : c.attention)}</strong> ` +
    `<code>${escapeHtml(change.kind)}</code> ${escapeHtml(change.entity)}<dl>` +
    htmlDetail(c.earlier, change.before) + htmlDetail(c.later, change.after) + "</dl></li>";
}
function htmlFrame(locale: ParityLocale, title: string, contents: string): string {
  const c = copy(locale);
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; img-src 'none'; form-action 'none'; base-uri 'none'">` +
    `<title>${escapeHtml(title)}</title><style>` +
    `:root{color-scheme:light dark}*{box-sizing:border-box}body{font-family:system-ui,sans-serif;line-height:1.55;max-width:78rem;margin:auto;padding:1.25rem;background:Canvas;color:CanvasText}` +
    `h1,h2,h3,h4{line-height:1.25}a,button{min-height:44px;min-width:44px;display:inline-flex;align-items:center;padding:.5rem}` +
    `a:focus-visible,button:focus-visible{outline:3px solid Highlight;outline-offset:3px}.skip{position:absolute;left:-10000px}.skip:focus{left:1rem;top:1rem;background:Canvas}` +
    `section{border-top:1px solid GrayText;padding-block:1rem}.detail{display:grid;grid-template-columns:minmax(10rem,1fr) 3fr;gap:1rem;padding:.25rem}dd{margin:0;overflow-wrap:anywhere}` +
    `li{overflow-wrap:anywhere;margin-block:.35rem}code{overflow-wrap:anywhere}p{max-width:80ch}button{font:inherit}` +
    `@media(max-width:600px){.detail{display:block}}@media(print){body{padding:0}.skip,button{display:none}section{break-inside:avoid}}` +
    `@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;animation:none!important;transition:none!important}}` +
    `</style></head><body><a href="#main" class="skip">${escapeHtml(c.skip)}</a>` +
    `<header><h1>${escapeHtml(title)}</h1></header><main id="main" tabindex="-1">${contents}</main>` +
    `<footer><p>${escapeHtml(c.notice)}</p></footer></body></html>`;
}
/** Rendering is deterministic and network-free. Source URLs are displayed as text. */
export function renderParityReport(
  bundle: OfflineBundle, plan: ParityPlan, result: ParityResult,
  locale: ParityLocale, comparison?: ParityComparison,
): ParityRenderedReport {
  const c = copy(locale);
  const status = result.blocked || comparison?.blocked ? c.blocked : c.ready;
  const lines = [c.title, line(locale, c.release, result.releaseId), line(locale, c.status, status), c.intro,
    `# ${c.pairs}`, ...result.summaries.flatMap((item) => summaryText(item, bundle, locale)),
    `# ${c.findings}`, ...(result.findings.length ? result.findings.map((finding) => findingText(finding, locale)) : [c.noFindings])];
  if (comparison) lines.push(`# ${c.changes}`, ...(comparison.changes.length ? comparison.changes.map((change) => changeText(change, locale)) : [c.noChanges]));
  lines.push(c.notice);
  const sections = `<p>${escapeHtml(c.intro)}</p><p><strong>${escapeHtml(line(locale, c.release, result.releaseId))}</strong></p>` +
    `<p role="status">${escapeHtml(line(locale, c.status, status))}</p><section aria-labelledby="pairs"><h2 id="pairs">${escapeHtml(c.pairs)}</h2>` +
    result.summaries.map((item) => summaryHtml(item, bundle, locale)).join("") + `</section>` +
    `<section aria-labelledby="findings"><h2 id="findings">${escapeHtml(c.findings)}</h2>` +
    (result.findings.length ? `<ul>${result.findings.map((item) => findingHtml(item, locale)).join("")}</ul>` : `<p>${escapeHtml(c.noFindings)}</p>`) + "</section>" +
    (comparison ? `<section aria-labelledby="changes"><h2 id="changes">${escapeHtml(c.changes)}</h2>` +
      (comparison.changes.length ? `<ul>${comparison.changes.map((item) => changeHtml(item, locale)).join("")}</ul>` : `<p>${escapeHtml(c.noChanges)}</p>`) + "</section>" : "");
  const json = JSON.stringify({ schema: "attribution-bilingual-parity-export/1", locale, plan, report: result,
    comparison: comparison ?? null, includedSources: bundle.release.sources.filter((source) => source.state === "included") }, null, 2) + "\n";
  return { locale, text: lines.join("\n\n") + "\n", html: htmlFrame(locale, c.title, sections), json };
}
