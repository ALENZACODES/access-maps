import {auditInventory, compareInventories, surfaceProjection} from './dependency-audit.mjs';
import {parseInventory, UNKNOWN} from './dependency-core.mjs';

/** Display words are separate from the legal text supplied in evidence records. */
export const COPY = Object.freeze({
  en: Object.freeze({
    title: 'Offline attribution dependency inspector',
    intro: 'Trace source notices through local files and their dependencies. Missing records remain UNKNOWN.',
    warning: 'An inventory is a record supplied by a person, not a statement about physical access or permission to redistribute.',
    skip: 'Skip to main content', language: 'Language', english: 'English', french: 'Français',
    open: 'Open inventory JSON', prior: 'Compare with earlier inventory JSON', empty: 'Start empty inventory',
    summary: 'Recorded coverage', findings: 'Evidence gaps', dependencies: 'Files and dependencies',
    sources: 'Sources', surfaces: 'Publication views', selected: 'Choose publication view',
    all: 'All views', noSurfaces: 'No publication views recorded.', noFindings: 'No gaps in the supplied records. Manual review remains necessary.',
    source: 'Source', licence: 'Licence', retrieved: 'Retrieved on', tier: 'Evidence tier',
    status: 'Recorded status', notices: 'Notice records', path: 'Local file', direct: 'Direct source',
    inherited: 'Inherited source', position: 'Notice location', observation: 'Observed on',
    noPermission: 'Recorded data does not establish redistribution rights.',
    sourceImpact: 'Source impact paths', chooseSource: 'Choose source', impactSummary: 'Affected publication views',
    exportImpact: 'Export source impact as text', exportImpactTable: 'Export source impact matrix (TSV)',
    noImpact: 'No documented publication views use this source.',
    exportJson: 'Export inventory JSON', exportReport: 'Export findings as text', exportTsv: 'Export coverage table (TSV)',
    exportGraph: 'Export dependency table (TSV)', exportComparison: 'Export comparison as text',
    importGood: 'Inventory loaded into temporary memory.', importBad: 'The inventory could not be loaded. Existing data was retained.',
    comparisonGood: 'Earlier inventory loaded for comparison.', comparisonEmpty: 'Choose an earlier inventory to compare.',
    changed: 'Changed records', newGaps: 'New evidence gaps', resolved: 'Gaps no longer recorded',
    missing: 'UNKNOWN', sample: 'This tool does not populate facts about any real location.',
    offline: 'This page does not send inventory files to external services.',
    fileLimit: 'The selected file exceeds the one-megabyte limit.',
    error: 'The operation could not be completed.', reset: 'Clear local records',
    resetDone: 'The temporary inventory is empty.',
    included: 'Included files', referenced: 'Referenced sources', blocking: 'Blocking gaps',
    recordType: 'Record type', recordId: 'Record ID', severity: 'Severity', reason: 'Finding code',
    noSelection: 'All publication views', noRights: 'Do not interpret this report as a grant of rights.',
  }),
  fr: Object.freeze({
    title: 'Inspection hors ligne des dépendances d’attribution',
    intro: 'Suivez les mentions de sources à travers les fichiers locaux et leurs dépendances. Les renseignements manquants restent UNKNOWN.',
    warning: 'Un inventaire consigne des renseignements fournis par une personne. Il ne décrit ni l’accès physique ni les droits de redistribution.',
    skip: 'Aller au contenu principal', language: 'Langue', english: 'English', french: 'Français',
    open: 'Ouvrir un inventaire JSON', prior: 'Comparer avec un inventaire JSON antérieur', empty: 'Commencer un inventaire vide',
    summary: 'Couverture consignée', findings: 'Lacunes dans les preuves', dependencies: 'Fichiers et dépendances',
    sources: 'Sources', surfaces: 'Vues de publication', selected: 'Choisir une vue de publication',
    all: 'Toutes les vues', noSurfaces: 'Aucune vue de publication consignée.', noFindings: 'Aucune lacune dans les fiches fournies. Une revue humaine reste nécessaire.',
    source: 'Source', licence: 'Licence', retrieved: 'Date de récupération', tier: 'Niveau de preuve',
    status: 'État consigné', notices: 'Fiches des mentions', path: 'Fichier local', direct: 'Source directe',
    inherited: 'Source héritée', position: 'Emplacement de la mention', observation: 'Date de l’observation',
    noPermission: 'Les données consignées n’établissent pas les droits de redistribution.',
    sourceImpact: 'Incidence des sources', chooseSource: 'Choisir une source', impactSummary: 'Vues de publication concernées',
    exportImpact: 'Exporter l’incidence de la source en texte', exportImpactTable: 'Exporter le tableau des incidences (TSV)',
    noImpact: 'Aucune vue de publication consignée n’utilise cette source.',
    exportJson: 'Exporter l’inventaire JSON', exportReport: 'Exporter les lacunes en texte', exportTsv: 'Exporter le tableau de couverture (TSV)',
    exportGraph: 'Exporter le tableau des dépendances (TSV)', exportComparison: 'Exporter la comparaison en texte',
    importGood: 'Inventaire chargé temporairement en mémoire.', importBad: 'Impossible de charger l’inventaire. Les données actuelles sont conservées.',
    comparisonGood: 'Inventaire antérieur chargé pour comparaison.', comparisonEmpty: 'Choisissez un ancien inventaire pour la comparaison.',
    changed: 'Fiches modifiées', newGaps: 'Nouvelles lacunes', resolved: 'Lacunes non consignées à présent',
    missing: 'UNKNOWN', sample: 'Cet outil ne crée aucun renseignement sur un lieu réel.',
    offline: 'Cette page ne transmet pas les inventaires à des services externes.',
    fileLimit: 'Le fichier choisi dépasse la limite d’un mégaoctet.',
    error: 'Impossible de terminer l’opération.', reset: 'Effacer les fiches locales',
    resetDone: 'L’inventaire temporaire est vide.',
    included: 'Fichiers inclus', referenced: 'Sources référencées', blocking: 'Lacunes bloquantes',
    recordType: 'Type de fiche', recordId: 'ID de la fiche', severity: 'Gravité', reason: 'Code de constat',
    noSelection: 'Toutes les vues de publication', noRights: 'Ce rapport n’accorde aucun droit.',
  }),
});
export function localeFromSearch(search) {
  if (typeof search !== 'string' || search.length > 512) return 'en';
  return new URLSearchParams(search).get('lang') === 'fr' ? 'fr' : 'en';
}
export function labelValue(label, value, locale = 'en') {
  return `${label}${locale === 'fr' ? '\u00a0:' : ':'} ${value}`;
}
const TABLE_COLUMNS = Object.freeze([
  'surfaceId','surfaceLocale','route','assetId','assetPath','assetKind','assetMode',
  'assetBytes','sourceId','sourceName','sourceUrl','licence','licenceUrl','retrievedOn',
  'tier','permission','credit','noticeText','noticePosition','noticeObservedOn','noticeVisible','noticeReadable',
]);
export function coverageRows(input) {
  const data = parseInventory(input);
  const rows = [];
  for (const surface of data.surfaces) {
    const projection = surfaceProjection(data, surface.id);
    const noticeBySource = new Map(surface.notices.map(notice => [notice.sourceId, notice]));
    const bySource = new Map(data.sources.map(source => [source.id, source]));
    for (const asset of projection.assets) {
      for (const sourceId of asset.sourceIds) {
        const source = bySource.get(sourceId);
        const notice = noticeBySource.get(sourceId);
        rows.push({
          surfaceId:surface.id, surfaceLocale:surface.locale, route:surface.route,
          assetId:asset.id, assetPath:asset.path, assetKind:asset.kind, assetMode:asset.mode,
          assetBytes:asset.bytes, sourceId, sourceName:source.name, sourceUrl:source.sourceUrl,
          licence:source.licence, licenceUrl:source.licenceUrl, retrievedOn:source.retrievedOn,
          tier:source.tier, permission:source.permission, credit:source.credit,
          noticeText:notice?.text ?? UNKNOWN, noticePosition:notice?.position ?? UNKNOWN,
          noticeObservedOn:notice?.observedOn ?? UNKNOWN, noticeVisible:notice?.visible ?? UNKNOWN,
          noticeReadable:notice?.readable ?? UNKNOWN,
        });
      }
    }
  }
  return rows.sort((a,b)=>a.surfaceId.localeCompare(b.surfaceId)||a.assetId.localeCompare(b.assetId)||a.sourceId.localeCompare(b.sourceId));
}
export function dependencyRows(input) {
  const data = parseInventory(input);
  const rows = [];
  for (const asset of data.assets) {
    for (const dependency of asset.dependsOn) rows.push({assetId:asset.id, dependsOn:dependency, relationship:'depends-on'});
    for (const sourceId of asset.sourceIds) rows.push({assetId:asset.id, dependsOn:sourceId, relationship:'sourced-from'});
    if (!asset.dependsOn.length && !asset.sourceIds.length) rows.push({assetId:asset.id, dependsOn:UNKNOWN, relationship:'unrecorded'});
  }
  return rows.sort((a,b)=>a.assetId.localeCompare(b.assetId)||a.relationship.localeCompare(b.relationship)||a.dependsOn.localeCompare(b.dependsOn));
}
export function safeTsvCell(input) {
  let output = String(input ?? UNKNOWN).replace(/[\t\r\n\u0000-\u001f\u007f]/gu, ' ');
  if (/^\s*[=+@-]/u.test(output)) output = `'${output}`;
  return output;
}
export function renderTsv(rows, columns) {
  if (!Array.isArray(rows) || !Array.isArray(columns)) throw new TypeError('Expected table');
  const result = [columns.map(safeTsvCell).join('\t')];
  for (const row of rows) {
    if (!row || typeof row !== 'object') throw new TypeError('Invalid table row');
    result.push(columns.map(column => safeTsvCell(row[column])).join('\t'));
  }
  return `${result.join('\n')}\n`;
}
export function coverageTsv(input) { return renderTsv(coverageRows(input), TABLE_COLUMNS); }
export function dependencyTsv(input) { return renderTsv(dependencyRows(input), ['assetId','dependsOn','relationship']); }
export function reportText(input, locale = 'en') {
  const data = parseInventory(input);
  const report = auditInventory(data);
  const language = locale === 'fr' ? 'fr' : 'en';
  const t = COPY[language];
  const lines = [t.title, '', data.title, t.warning, '',
    labelValue(t.blocking, report.counts.block, language), labelValue(t.status, report.status, language), ''];
  for (const projected of report.projections) {
    lines.push(labelValue(t.selected, projected.surfaceId, language),
      labelValue(t.path, projected.route, language),
      labelValue(t.included, projected.assetIds.join(', ') || UNKNOWN, language),
      labelValue(t.referenced, projected.sourceIds.join(', ') || UNKNOWN, language), '');
  }
  for (const row of coverageRows(data)) {
    lines.push(labelValue(t.path, row.assetPath, language),
      labelValue(t.source, `${row.sourceName} (${row.sourceId})`, language),
      labelValue(t.licence, row.licence, language),
      labelValue(t.retrieved, row.retrievedOn, language),
      labelValue(t.tier, row.tier, language),
      labelValue(t.notices, row.noticeText, language),
      labelValue(t.position, row.noticePosition, language), '');
  }
  for (const finding of report.findings) {
    lines.push(`${finding.severity.toUpperCase()} | ${finding.surfaceId} | ${finding.assetId} | ${finding.sourceId} | ${finding.code}`);
  }
  if (!report.findings.length) lines.push(t.noFindings);
  lines.push('', t.noRights);
  return `${lines.join('\n')}\n`;
}
export function comparisonText(before, after, locale = 'en') {
  const comparison = compareInventories(before, after);
  const language = locale === 'fr' ? 'fr' : 'en';
  const t = COPY[language];
  const lines = [t.title, t.warning, '', labelValue(t.changed, comparison.alerts.length, language),
    labelValue(t.newGaps, comparison.introduced.length, language),
    labelValue(t.resolved, comparison.resolved.length, language), ''];
  for (const alert of comparison.alerts) lines.push(`${alert.code} | ${alert.id} | ${alert.field}`);
  for (const finding of comparison.introduced) lines.push(`+ ${finding.code} | ${finding.surfaceId} | ${finding.sourceId}`);
  for (const finding of comparison.resolved) lines.push(`- ${finding.code} | ${finding.surfaceId} | ${finding.sourceId}`);
  return `${lines.join('\n')}\n`;
}
export const COVERAGE_COLUMNS = TABLE_COLUMNS;
