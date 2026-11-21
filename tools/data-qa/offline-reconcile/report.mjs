/** Pure rendering and privacy-safe export helpers. */
import { stableSort } from './contract.mjs';

export const COPY = Object.freeze({
  en: {
    heading: 'Offline evidence reconciliation',
    localFiles: 'Local files', reviewFindings: 'Review findings', skip: 'Skip to review',
    intro: 'Review locally supplied source records. No information is sent to a server.',
    disclaimer: 'This report describes records and information gaps. It does not determine personal suitability.',
    language: 'Language', audit: 'Check publication', compare: 'Compare releases',
    current: 'Current package', previous: 'Previous package', report: 'Review findings',
    policy: 'Removal policy', noFile: 'Choose a local JSON file.',
    pass: 'Checks passed', fail: 'Publication blocked',
    loadError: 'The local file could not be read.', formatError: 'The file is not valid JSON.',
    unknown: 'UNKNOWN', source: 'Source', licence: 'Licence', date: 'Observation date',
    findAll: 'All findings', findErrors: 'Blocking findings', findNotices: 'Notices',
    exportJson: 'Save JSON report', exportCsv: 'Save CSV findings',
    summary: 'Summary', code: 'Code', path: 'Location', detail: 'Issue',
    severity: 'Severity', count: 'Count', empty: 'No findings to display.',
    privacy: 'Only local files are processed. Reports do not contain the original observation notes.',
    offline: 'Works without internet access after opening the local page.',
    changed: 'Changed decisions', removed: 'Removed decisions', added: 'Added decisions',
    reset: 'Clear the report', filter: 'Filter findings',
    asOf: 'As-of date', observations: 'Observations', sources: 'Sources', decisions: 'Decisions',
  },
  fr: {
    heading: 'Rapprochement hors ligne des observations',
    localFiles: 'Fichiers locaux', reviewFindings: 'Examiner les résultats', skip: 'Aller à l’examen',
    intro: 'Examinez les sources fournies localement. Aucun renseignement n’est envoyé à un serveur.',
    disclaimer: 'Ce rapport décrit les fiches et les renseignements manquants. Il ne détermine pas l’adéquation à une situation personnelle.',
    language: 'Langue', audit: 'Contrôler la publication', compare: 'Comparer les publications',
    current: 'Paquet actuel', previous: 'Paquet précédent', report: 'Examiner les résultats',
    policy: 'Règle de retrait', noFile: 'Choisissez un fichier JSON local.',
    pass: 'Contrôles réussis', fail: 'Publication bloquée',
    loadError: 'Le fichier local n’a pas pu être lu.', formatError: 'Le fichier JSON n’est pas valide.',
    unknown: 'UNKNOWN', source: 'Source', licence: 'Licence', date: 'Date d’observation',
    findAll: 'Tous les résultats', findErrors: 'Résultats bloquants', findNotices: 'Avis',
    exportJson: 'Enregistrer le rapport JSON', exportCsv: 'Enregistrer les résultats CSV',
    summary: 'Résumé', code: 'Code', path: 'Emplacement', detail: 'Problème',
    severity: 'Gravité', count: 'Nombre', empty: 'Aucun résultat à afficher.',
    privacy: 'Seuls les fichiers locaux sont traités. Les rapports ne contiennent pas les notes d’observation originales.',
    offline: 'Fonctionne sans connexion Internet après l’ouverture de la page locale.',
    changed: 'Décisions modifiées', removed: 'Décisions retirées', added: 'Décisions ajoutées',
    reset: 'Effacer le rapport', filter: 'Filtrer les résultats',
    asOf: 'Date de référence', observations: 'Observations', sources: 'Sources', decisions: 'Décisions',
  },
});
export function copy(locale) { return COPY[locale] ?? COPY.en; }
export function localeKeys() {
  return { en: Object.keys(COPY.en).sort(), fr: Object.keys(COPY.fr).sort() };
}
export function visibleFindings(result, severity = 'ALL') {
  if (!result || !Array.isArray(result.findings)) return [];
  return result.findings.filter(f => severity === 'ALL' || f.severity === severity);
}
export function safeResult(result) {
  return { ok: Boolean(result?.ok), totals: result?.totals ?? {},
    findings: Array.isArray(result?.findings) ? result.findings.map(f => ({
      code: String(f.code), severity: f.severity === 'NOTICE' ? 'NOTICE' : 'ERROR',
      path: String(f.path), en: String(f.en), fr: String(f.fr),
    })) : [] };
}
export function reportJson(result) { return `${JSON.stringify(safeResult(result), null, 2)}\n`; }
function csvCell(value) {
  const plain = String(value ?? '');
  // Spreadsheet formula neutralization in addition to RFC4180 quoting.
  const escaped = /^[=+@\-\t\r]/u.test(plain) ? `'${plain}` : plain;
  return `"${escaped.replaceAll('"', '""')}"`;
}
export function reportCsv(result, locale = 'en') {
  const items = visibleFindings(result);
  const columns = ['severity', 'code', 'path', 'message'];
  const rows = [columns.map(csvCell).join(',')];
  for (const issue of items) {
    rows.push([issue.severity, issue.code, issue.path, issue[locale] ?? issue.en].map(csvCell).join(','));
  }
  return `${rows.join('\r\n')}\r\n`;
}
export function findingCounts(result) {
  const issues = visibleFindings(result);
  return { all: issues.length, errors: issues.filter(f => f.severity === 'ERROR').length,
    notices: issues.filter(f => f.severity === 'NOTICE').length };
}
export function groupedFindings(result) {
  const groups = new Map();
  for (const issue of visibleFindings(result)) {
    const set = groups.get(issue.code) ?? [];
    set.push(issue);
    groups.set(issue.code, set);
  }
  return stableSort([...groups].map(([code, findings]) => ({ code, count: findings.length,
    errors: findings.filter(f => f.severity === 'ERROR').length })), x => x.code);
}
export function textReport(result, locale = 'en') {
  const safe = safeResult(result);
  const lines = [safe.ok ? copy(locale).pass : copy(locale).fail];
  for (const finding of safe.findings) lines.push(`${finding.severity} ${finding.code} ${finding.path}: ${finding[locale]}`);
  return `${lines.join('\n')}\n`;
}
export function exportFilename(mode, format) {
  return `offline-${mode === 'compare' ? 'comparison' : 'audit'}-report.${format === 'csv' ? 'csv' : 'json'}`;
}
export function readableTotal(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString('en-CA') : 'UNKNOWN';
}
