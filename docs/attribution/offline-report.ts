/** Human-readable, network-free bundle reports; all rendered input is escaped. */
import type { BundleProblem, OfflineBundle, BundleAudit } from "./offline-bundle.js";
import type { FilesystemAudit } from "./offline-files.js";
import { combinedFindings } from "./offline-files.js";

export type OfflineLocale = "en" | "fr";
export interface OfflineReport {
  readonly locale: OfflineLocale;
  readonly releaseId: string;
  readonly text: string;
  readonly html: string;
  readonly json: string;
}
interface Labels {
  readonly title: string;
  readonly release: string;
  readonly status: string;
  readonly blocked: string;
  readonly review: string;
  readonly assets: string;
  readonly routes: string;
  readonly size: string;
  readonly unknown: string;
  readonly sources: string;
  readonly notices: string;
  readonly details: string;
  readonly evidence: string;
  readonly source: string;
  readonly licence: string;
  readonly date: string;
  readonly offline: string;
  readonly file: string;
  readonly actual: string;
  readonly skip: string;
  readonly noFindings: string;
  readonly routesHeading: string;
  readonly assetsHeading: string;
  readonly findingsHeading: string;
  readonly print: string;
  readonly sourceHeading: string;
  readonly origin: string;
  readonly licenceAddress: string;
  readonly attribution: string;
  readonly acquired: string;
  readonly family: string;
}
const EN: Labels = {
  title: "Offline attribution bundle report", release: "Release", status: "Status",
  blocked: "Blocked by recorded gaps", review: "No blocking gaps in the supplied evidence",
  assets: "Assets", routes: "Routes", size: "Declared bytes", unknown: "UNKNOWN",
  sources: "Sources", notices: "Notices", details: "Details", evidence: "Evidence",
  source: "Source", licence: "Licence", date: "Dataset date", offline: "Offline",
  file: "Asset path", actual: "Observed file bytes", skip: "Skip to report",
  noFindings: "No bundle findings", routesHeading: "Route coverage",
  assetsHeading: "Included assets", findingsHeading: "Bundle findings", print: "Print",
  sourceHeading: "Recorded source evidence", origin: "Origin URL", licenceAddress: "Licence URL",
  attribution: "Attribution text", acquired: "Acquired on", family: "Source family",
};
const FR: Labels = {
  title: "Rapport sur les sources hors connexion", release: "Version", status: "État",
  blocked: "Publication bloquée par des renseignements manquants", review: "Aucun élément bloquant dans les renseignements fournis",
  assets: "Fichiers", routes: "Pages", size: "Octets déclarés", unknown: "UNKNOWN",
  sources: "Sources", notices: "Mentions", details: "Détails", evidence: "Renseignements",
  source: "Source", licence: "Licence", date: "Données en date du", offline: "Hors connexion",
  file: "Chemin du fichier", actual: "Octets observés", skip: "Accéder au rapport",
  noFindings: "Aucun point à signaler", routesHeading: "Couverture des pages",
  assetsHeading: "Fichiers inclus", findingsHeading: "Points à examiner", print: "Imprimer",
  sourceHeading: "Renseignements sur les sources", origin: "Adresse de la source",
  licenceAddress: "Adresse de la licence", attribution: "Mention de la source",
  acquired: "Date d’acquisition", family: "Catégorie de source",
};
function labels(locale: OfflineLocale): Labels { return locale === "fr" ? FR : EN; }
function colon(locale: OfflineLocale): string { return locale === "fr" ? "\u00a0: " : ": "; }
function line(locale: OfflineLocale, label: string, value: string | number): string {
  return `${label}${colon(locale)}${value}`;
}
function textValue(value: string | number): string { return String(value); }
function textFindings(findings: readonly BundleProblem[], locale: OfflineLocale): string[] {
  return findings.map((finding) => `${finding.level.toUpperCase()} [${finding.code}] ${finding.location} — ${finding.description}`);
}
function escapeHtml(text: string): string {
  return text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;").replace(/'/gu, "&#39;");
}
function element(name: string, value: string, kind: "dt" | "dd" = "dd"): string {
  return `<${kind}>${escapeHtml(value)}</${kind}>`;
}
function definition(label: string, value: string): string {
  return `<div>${element("", label, "dt")}${element("", value)}</div>`;
}
function findingsHtml(findings: readonly BundleProblem[], locale: OfflineLocale): string {
  if (findings.length === 0) return `<p>${escapeHtml(labels(locale).noFindings)}</p>`;
  return `<ol>${findings.map((problem) => `<li><strong>${escapeHtml(problem.code)}</strong> — ` +
    `${escapeHtml(problem.location)} — ${escapeHtml(problem.description)}</li>`).join("")}</ol>`;
}
function routeHtml(bundle: OfflineBundle, audit: BundleAudit, locale: OfflineLocale): string {
  const t = labels(locale);
  return bundle.routes.map((route) => {
    const paths = audit.reachable[route.id] ?? [];
    return `<article><h3>${escapeHtml(route.id)}</h3><dl>` +
      definition(t.file, route.path) + definition(t.offline, route.offline) +
      definition(t.sources, route.sourceIds.join(", ") || t.unknown) +
      definition(t.assets, String(paths.length)) + `</dl></article>`;
  }).join("");
}
function sourceHtml(bundle: OfflineBundle, locale: OfflineLocale): string {
  const t = labels(locale);
  return bundle.release.sources.map((source) =>
    `<article><h3>${escapeHtml(source.name)}</h3><dl>` +
      definition(t.family, source.family) + definition(t.origin, source.sourceUrl) +
      definition(t.licence, source.licenceName) + definition(t.licenceAddress, source.licenceUrl) +
      definition(t.acquired, source.acquisitionDate) + definition(t.date, source.datasetDate) +
      definition(t.evidence, source.licenceEvidence) + definition(t.attribution, source.attribution || t.unknown) +
      `</dl></article>`).join("");
}
function sourceText(bundle: OfflineBundle, locale: OfflineLocale): string[] {
  const t = labels(locale);
  const lines: string[] = ["", t.sourceHeading];
  for (const source of bundle.release.sources) {
    lines.push(`• ${source.name}`, `  ${line(locale, t.family, source.family)}`,
      `  ${line(locale, t.origin, source.sourceUrl)}`, `  ${line(locale, t.licence, source.licenceName)}`,
      `  ${line(locale, t.licenceAddress, source.licenceUrl)}`,
      `  ${line(locale, t.acquired, source.acquisitionDate)}`,
      `  ${line(locale, t.date, source.datasetDate)}`,
      `  ${line(locale, t.evidence, source.licenceEvidence)}`,
      `  ${line(locale, t.attribution, source.attribution || t.unknown)}`);
  }
  return lines;
}
function assetHtml(bundle: OfflineBundle, locale: OfflineLocale): string {
  const t = labels(locale);
  return bundle.assets.filter((asset) => asset.disposition === "included").map((asset) =>
    `<article><h3>${escapeHtml(asset.path)}</h3><dl>` +
      definition(t.size, textValue(asset.bytes)) + definition(t.sources, asset.sourceIds.join(", ") || t.unknown) +
      definition(t.details, asset.dependencies.join(", ") || "—") + `</dl></article>`).join("");
}
function reportText(bundle: OfflineBundle, audit: BundleAudit, findings: readonly BundleProblem[], locale: OfflineLocale): string {
  const t = labels(locale);
  const lines = [t.title, line(locale, t.release, bundle.release.releaseId),
    line(locale, t.status, audit.blocked ? t.blocked : t.review),
    line(locale, t.routes, bundle.routes.length), line(locale, t.assets, bundle.assets.length),
    line(locale, t.size, audit.totalBytes), "", t.routesHeading];
  for (const route of bundle.routes) {
    lines.push(`• ${route.id}`, `  ${line(locale, t.file, route.path)}`,
      `  ${line(locale, t.offline, route.offline)}`, `  ${line(locale, t.sources, route.sourceIds.join(", ") || t.unknown)}`,
      `  ${line(locale, t.assets, (audit.reachable[route.id] ?? []).length)}`);
  }
  lines.push(...sourceText(bundle, locale));
  lines.push("", t.assetsHeading);
  for (const asset of bundle.assets.filter((item) => item.disposition === "included")) {
    lines.push(`• ${asset.path} — ${line(locale, t.size, asset.bytes)}`);
  }
  lines.push("", t.findingsHeading, ...textFindings(findings, locale));
  if (!findings.length) lines.push(t.noFindings);
  return lines.join("\n") + "\n";
}
export function makeOfflineReport(bundle: OfflineBundle, result: BundleAudit | FilesystemAudit, locale: OfflineLocale): OfflineReport {
  const t = labels(locale);
  const fs: FilesystemAudit | null = "base" in result ? result : null;
  const audit: BundleAudit = fs ? fs.base : result as BundleAudit;
  const findings = fs ? combinedFindings(fs) : audit.problems;
  const blocked = fs ? fs.blocked : audit.blocked;
  const text = reportText(bundle, { ...audit, blocked }, findings, locale);
  const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(t.title)}</title>` +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; connect-src 'none'">` +
    `<style>body{font:1.05rem/1.55 system-ui,sans-serif;max-width:74ch;margin:auto;padding:1rem;color:#171717;background:#fff}` +
    `a,button{min-width:44px;min-height:44px;display:inline-flex;align-items:center;padding:.5rem;box-sizing:border-box}` +
    `a:focus-visible,button:focus-visible{outline:3px solid #145aa0;outline-offset:3px}` +
    `dl>div{display:grid;grid-template-columns:minmax(9rem,1fr) 2fr;gap:1rem;padding:.4rem 0}` +
    `dt{font-weight:700}article{border-top:1px solid #777;padding:1rem 0;overflow-wrap:anywhere}` +
    `@media print{.skip{display:none}}@media(max-width:420px){dl>div{display:block}}</style></head><body>` +
    `<a class="skip" href="#report">${escapeHtml(t.skip)}</a><header><h1>${escapeHtml(t.title)}</h1></header>` +
    `<main id="report"><dl>` + definition(t.release, bundle.release.releaseId) +
    definition(t.status, blocked ? t.blocked : t.review) + definition(t.routes, String(bundle.routes.length)) +
    definition(t.assets, String(bundle.assets.length)) + definition(t.size, String(audit.totalBytes)) + `</dl>` +
    `<section aria-labelledby="routes"><h2 id="routes">${escapeHtml(t.routesHeading)}</h2>${routeHtml(bundle, audit, locale)}</section>` +
    `<section aria-labelledby="sources"><h2 id="sources">${escapeHtml(t.sourceHeading)}</h2>${sourceHtml(bundle, locale)}</section>` +
    `<section aria-labelledby="assets"><h2 id="assets">${escapeHtml(t.assetsHeading)}</h2>${assetHtml(bundle, locale)}</section>` +
    `<section aria-labelledby="findings"><h2 id="findings">${escapeHtml(t.findingsHeading)}</h2>${findingsHtml(findings, locale)}</section>` +
    `</main></body></html>\n`;
  const json = JSON.stringify({schema:"attribution-offline-report/1", releaseId:bundle.release.releaseId,
    blocked, totalBytes:audit.totalBytes, findings, evidence:audit.evidence.findings, routes:audit.reachable,
    filesystem:fs ? {inspected:fs.inspected,matched:fs.matched,missing:fs.missing} : null}, null, 2) + "\n";
  return {locale, releaseId:bundle.release.releaseId, text, html, json};
}
