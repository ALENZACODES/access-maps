import type { ReleaseEvidence, SourceEvidence, SurfaceEvidence } from "./evidence-contract.js";
import type { AuditFinding, AuditResult } from "./evidence-audit.js";
import type { ComparisonResult, EvidenceChange } from "./evidence-changes.js";

export type ReportLocale = "en" | "fr";

interface MessageCatalogue {
  readonly heading: string;
  readonly release: string;
  readonly status: string;
  readonly blocked: string;
  readonly noBlocks: string;
  readonly sources: string;
  readonly surfaces: string;
  readonly findings: string;
  readonly changeHeading: string;
  readonly noFindings: string;
  readonly unknown: string;
  readonly source: string;
  readonly licence: string;
  readonly acquisition: string;
  readonly dataset: string;
  readonly date: string;
  readonly permission: string;
  readonly target: string;
  readonly involved: string;
  readonly before: string;
  readonly after: string;
  readonly offline: string;
  readonly evidence: string;
}

const EN: MessageCatalogue = {
  heading: "Attribution evidence report",
  release: "Release",
  status: "Status",
  blocked: "Release blocked by evidence gaps",
  noBlocks: "No blocking findings in the supplied records",
  sources: "Sources",
  surfaces: "Publication surfaces",
  findings: "Findings",
  changeHeading: "Changes since the comparison release",
  noFindings: "No findings",
  unknown: "UNKNOWN",
  source: "Source URL",
  licence: "Licence",
  acquisition: "Acquired",
  dataset: "Dataset date",
  date: "Terms reviewed",
  permission: "Redistribution permission",
  target: "Minimum target dimension",
  involved: "Linked sources",
  before: "Before",
  after: "After",
  offline: "Offline",
  evidence: "Evidence state",
};

const FR: MessageCatalogue = {
  heading: "Rapport sur les sources et les licences",
  release: "Version",
  status: "État",
  blocked: "Publication bloquée en raison de renseignements manquants",
  noBlocks: "Aucun élément bloquant dans les renseignements fournis",
  sources: "Sources",
  surfaces: "Vues publiées",
  findings: "Points à examiner",
  changeHeading: "Changements depuis la version précédente",
  noFindings: "Aucun point à signaler",
  unknown: "UNKNOWN",
  source: "Adresse de la source",
  licence: "Licence",
  acquisition: "Date d’acquisition",
  dataset: "Données en date du",
  date: "Conditions consultées le",
  permission: "Permission de redistribution",
  target: "Dimension minimale des cibles",
  involved: "Sources liées",
  before: "Avant",
  after: "Après",
  offline: "Hors connexion",
  evidence: "État des renseignements",
};

function messages(locale: ReportLocale): MessageCatalogue {
  return locale === "fr" ? FR : EN;
}

function label(locale: ReportLocale, key: keyof MessageCatalogue): string {
  return messages(locale)[key];
}

function identifierLabel(locale: ReportLocale): string {
  return locale === "fr" ? "Identifiant\u00a0: " : "ID: ";
}

function severityLabel(locale: ReportLocale, level: string): string {
  if (locale === "en") return level.toUpperCase();
  switch (level) {
    case "block": return "BLOQUANT";
    case "attention": return "À EXAMINER";
    case "info": return "INFORMATION";
    case "blocking": return "BLOQUANT";
    case "review": return "À EXAMINER";
    case "informational": return "INFORMATION";
    default: return "UNKNOWN";
  }
}

function separator(locale: ReportLocale): string {
  return locale === "fr" ? "\u00a0: " : ": ";
}

function line(locale: ReportLocale, key: keyof MessageCatalogue, value: string | number): string {
  return `${label(locale, key)}${separator(locale)}${value}`;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;").replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function visible(value: string | number): string {
  return value === "" ? "UNKNOWN" : String(value);
}

function sourceLines(source: SourceEvidence, locale: ReportLocale): string[] {
  return [
    source.name,
    `${identifierLabel(locale)}${source.id}`,
    line(locale, "source", visible(source.sourceUrl)),
    line(locale, "licence", `${source.licenceName} (${source.licenceUrl})`),
    line(locale, "permission", source.redistributionPermission),
    line(locale, "acquisition", source.acquisitionDate),
    line(locale, "dataset", source.datasetDate),
    line(locale, "date", source.termsReviewedDate),
    line(locale, "evidence", source.licenceEvidence),
    source.attribution,
  ];
}

function surfaceLines(surface: SurfaceEvidence, locale: ReportLocale): string[] {
  return [
    surface.name,
    `${identifierLabel(locale)}${surface.id}`,
    line(locale, "involved", surface.sourceIds.join(", ") || "UNKNOWN"),
    line(locale, "offline", surface.offline),
    line(locale, "target", visible(surface.minimumTargetPx)),
  ];
}

export function renderAuditText(
  release: ReleaseEvidence,
  audit: AuditResult,
  locale: ReportLocale,
): string {
  const lines = [
    label(locale, "heading"),
    line(locale, "release", release.releaseId),
    line(locale, "status", audit.blocked ? label(locale, "blocked") : label(locale, "noBlocks")),
    "",
    label(locale, "sources"),
  ];
  for (const source of release.sources) {
    lines.push("", ...sourceLines(source, locale));
  }
  lines.push("", label(locale, "surfaces"));
  for (const surface of release.surfaces) {
    lines.push("", ...surfaceLines(surface, locale));
  }
  lines.push("", label(locale, "findings"));
  if (audit.findings.length === 0) lines.push(label(locale, "noFindings"));
  for (const item of audit.findings) {
    lines.push(`${severityLabel(locale, item.level)}: ${item.code} [${item.path}] ${item.detail}`);
  }
  return lines.join("\n") + "\n";
}

function htmlParagraph(text: string): string {
  return `<p>${escapeHtml(text)}</p>`;
}

function htmlSource(source: SourceEvidence, locale: ReportLocale): string {
  return `<article aria-labelledby="source-${escapeHtml(source.id)}">` +
    `<h3 id="source-${escapeHtml(source.id)}">${escapeHtml(source.name)}</h3>` +
    sourceLines(source, locale).slice(1).map(htmlParagraph).join("\n") +
    "</article>";
}

function htmlSurface(surface: SurfaceEvidence, locale: ReportLocale): string {
  return `<article aria-labelledby="surface-${escapeHtml(surface.id)}">` +
    `<h3 id="surface-${escapeHtml(surface.id)}">${escapeHtml(surface.name)}</h3>` +
    surfaceLines(surface, locale).slice(1).map(htmlParagraph).join("\n") +
    "</article>";
}

function htmlFinding(finding: AuditFinding, locale: ReportLocale): string {
  const phrase = `${severityLabel(locale, finding.level)}: ${finding.code} ` +
    `[${finding.path}] ${finding.detail}`;
  return `<li>${escapeHtml(phrase)}</li>`;
}

const REPORT_CSS = `
  :root { color-scheme: light dark; font-family: system-ui, sans-serif; line-height: 1.55; }
  body { margin: 0 auto; max-width: 72rem; padding: 1rem; }
  a { min-height: 44px; min-width: 44px; display: inline-flex; align-items: center; }
  a:focus-visible { outline: 3px solid currentColor; outline-offset: 3px; }
  .skip { position: absolute; transform: translateY(-200%); }
  .skip:focus { position: static; transform: none; }
  article { padding: 1rem 0; border-bottom: 1px solid currentColor; }
  p { overflow-wrap: anywhere; }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; } }
  @media print { .skip { display: none; } body { max-width: none; } }
`;

/** Offline report with no scripts, external stylesheets or remote resources. */
export function renderAuditHtml(
  release: ReleaseEvidence,
  audit: AuditResult,
  locale: ReportLocale,
): string {
  const copy = messages(locale);
  const sources = release.sources.map((source) => htmlSource(source, locale)).join("\n");
  const surfaces = release.surfaces.map((surface) => htmlSurface(surface, locale)).join("\n");
  const findings = audit.findings.map((item) => htmlFinding(item, locale)).join("\n") ||
    `<li>${escapeHtml(copy.noFindings)}</li>`;
  const status = audit.blocked ? copy.blocked : copy.noBlocks;
  return [
    "<!doctype html>",
    `<html lang="${locale}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">`,
    `<title>${escapeHtml(copy.heading)}</title>`,
    `<style>${REPORT_CSS}</style>`,
    "</head><body>",
    '<a class="skip" href="#content">Skip to report / Aller au rapport</a>',
    '<main id="content">',
    `<h1>${escapeHtml(copy.heading)}</h1>`,
    htmlParagraph(line(locale, "release", release.releaseId)),
    htmlParagraph(line(locale, "status", status)),
    `<section aria-labelledby="source-heading"><h2 id="source-heading">${escapeHtml(copy.sources)}</h2>${sources}</section>`,
    `<section aria-labelledby="surface-heading"><h2 id="surface-heading">${escapeHtml(copy.surfaces)}</h2>${surfaces}</section>`,
    `<section aria-labelledby="finding-heading"><h2 id="finding-heading">${escapeHtml(copy.findings)}</h2><ul>${findings}</ul></section>`,
    "</main></body></html>",
  ].join("\n") + "\n";
}

export function renderChangesText(result: ComparisonResult, locale: ReportLocale): string {
  const lines = [
    label(locale, "changeHeading"),
    `${result.beforeReleaseId} → ${result.afterReleaseId}`,
    line(locale, "status", result.blocked ? label(locale, "blocked") : label(locale, "noBlocks")),
    "",
  ];
  for (const item of result.changes) {
    lines.push(`${severityLabel(locale, item.severity)}: ${item.kind} [${item.entityId}.${item.field}]`);
    lines.push(line(locale, "before", item.before));
    lines.push(line(locale, "after", item.after));
    lines.push("");
  }
  if (result.changes.length === 0) lines.push(label(locale, "noFindings"));
  return lines.join("\n") + "\n";
}

export function renderChangesHtml(result: ComparisonResult, locale: ReportLocale): string {
  const copy = messages(locale);
  const items = result.changes.map((item: EvidenceChange) => {
    const title = `${item.kind}: ${item.entityId}.${item.field}`;
    return `<li><strong>${escapeHtml(title)}</strong>` +
      htmlParagraph(line(locale, "before", item.before)) +
      htmlParagraph(line(locale, "after", item.after)) + "</li>";
  }).join("\n") || `<li>${escapeHtml(copy.noFindings)}</li>`;
  return [
    "<!doctype html>", `<html lang="${locale}"><head>`,
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'">`,
    `<title>${escapeHtml(copy.changeHeading)}</title><style>${REPORT_CSS}</style>`,
    '</head><body><a class="skip" href="#content">Skip / Passer</a>',
    `<main id="content"><h1>${escapeHtml(copy.changeHeading)}</h1>`,
    htmlParagraph(`${result.beforeReleaseId} → ${result.afterReleaseId}`),
    `<ol>${items}</ol></main></body></html>`,
  ].join("\n") + "\n";
}
