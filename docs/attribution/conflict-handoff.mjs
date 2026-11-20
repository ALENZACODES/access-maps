import {parseConflicts, UNKNOWN, OSM_CREDIT, conflictKey} from './conflict-core.mjs';
import {auditConflicts} from './conflict-audit.mjs';

/**
 * Offline, deterministic handoff summary for an operator-supplied discrepancy ledger.
 * This does not determine rights or properties of a place. Nothing is approved
 * merely because a field has been filled in.
 */
export const HANDOFF_SCHEMA = 'map-attribution-conflict-handoff/1';
const LOCALES = ['en', 'fr'];
const TEXT = Object.freeze({
  en: Object.freeze({
    title: 'Attribution review handoff', view: 'Publication view', source: 'Source',
    unresolved: 'Open or held records', blocking: 'Blocking findings', records: 'Records',
    scope: 'Scope', missing: 'Missing evidence', priority: 'Priority', decision: 'Decision',
    proposed: 'Proposed information', current: 'Current information', sourceLink: 'Evidence link',
    licence: 'Licence', retrieved: 'Retrieved on', tier: 'Evidence tier',
    reviewed: 'Reviewed on', reason: 'Review reason', notes: 'Review notes',
    none: 'None recorded', unknown: 'UNKNOWN', warnings: 'Findings',
    noRows: 'No discrepancy records have been supplied.',
    caution: 'This handoff records submitted evidence and outstanding questions. It does not establish redistribution permission, map correctness or accessibility.',
    duplicate: 'Another record refers to the same view, layer, source and category.',
    reportStatus: 'Handoff status', attention: 'Requires a human decision', recorded: 'Recorded for human review',
  }),
  fr: Object.freeze({
    title: 'Transmission de l’examen des mentions', view: 'Vue de publication', source: 'Source',
    unresolved: 'Fiches ouvertes ou en attente', blocking: 'Constats bloquants', records: 'Fiches',
    scope: 'Portée', missing: 'Preuves manquantes', priority: 'Priorité', decision: 'Décision',
    proposed: 'Renseignement proposé', current: 'Renseignement actuel', sourceLink: 'Lien de preuve',
    licence: 'Licence', retrieved: 'Récupération le', tier: 'Niveau de preuve',
    reviewed: 'Examen le', reason: 'Motif de l’examen', notes: 'Notes de l’examen',
    none: 'Aucune fiche', unknown: 'UNKNOWN', warnings: 'Constats',
    noRows: 'Aucune fiche de divergence n’a été fournie.',
    caution: 'Cette transmission consigne les preuves fournies et les questions en suspens. Elle n’établit ni une autorisation de redistribution, ni l’exactitude des cartes, ni l’accessibilité.',
    duplicate: 'Une autre fiche mentionne la même vue, couche, source et catégorie.',
    reportStatus: 'État de la transmission', attention: 'Décision humaine nécessaire', recorded: 'Consigné pour un examen humain',
  }),
});
export function handoffCopy(locale='en') { return TEXT[LOCALES.includes(locale) ? locale : 'en']; }

const gaps = row => {
  const missing = [];
  for (const key of ['surfaceId', 'layerId', 'sourceId', 'current', 'proposed',
    'source', 'licence', 'retrievedOn', 'tier', 'reason']) {
    if (row[key] === UNKNOWN || row[key] === '') missing.push(key);
  }
  if (row.decision === 'resolved' && row.reviewedOn === UNKNOWN) missing.push('reviewedOn');
  if (row.decision === 'resolved' && row.note === UNKNOWN) missing.push('note');
  if (row.sourceId === 'osm' && row.category === 'credit' && row.proposed !== UNKNOWN && !row.proposed.includes(OSM_CREDIT)) missing.push('osmCredit');
  return missing;
};
function lexical(a,b) { return String(a).localeCompare(String(b),'en'); }
function groupId(row) { return row.surfaceId; }
function evidenceRow(row, issues, duplicates) {
  const own = issues.filter(item => item.id === row.id);
  return {
    id:row.id, surfaceId:row.surfaceId, layerId:row.layerId, sourceId:row.sourceId,
    category:row.category, severity:row.severity, decision:row.decision,
    current:row.current, proposed:row.proposed,
    source:row.source, licence:row.licence, retrievedOn:row.retrievedOn,
    tier:row.tier, reviewedOn:row.reviewedOn, reason:row.reason, note:row.note,
    missingFields:gaps(row), findingCodes:[...new Set(own.map(x => x.code))].sort(lexical),
    duplicateScope:duplicates.has(conflictKey(row)),
    requiresAttention:row.decision !== 'resolved' || gaps(row).length > 0 || own.some(x=>x.severity==='blocking'),
  };
}
/** Stable output independent of source row order; records are not amended. */
export function buildHandoff(input, options={}) {
  const ledger = parseConflicts(input);
  const selection = options.surfaceId ?? null;
  if (selection !== null && (typeof selection !== 'string' ||
      !ledger.conflicts.some(x => x.surfaceId === selection))) {
    throw new RangeError('The selected publication view is not in the supplied register');
  }
  const audit = auditConflicts(ledger);
  const multiplicity = new Map();
  for (const row of ledger.conflicts) {
    const key = conflictKey(row);
    multiplicity.set(key, (multiplicity.get(key) ?? 0) + 1);
  }
  const duplicates = new Set([...multiplicity].filter(([,count])=>count>1).map(([key])=>key));
  const surfaces = new Map();
  for (const row of ledger.conflicts) {
    if (selection !== null && row.surfaceId !== selection) continue;
    if (!surfaces.has(groupId(row))) surfaces.set(groupId(row),[]);
    surfaces.get(groupId(row)).push(evidenceRow(row,audit.findings,duplicates));
  }
  const groups = [...surfaces].sort(([a],[b])=>lexical(a,b)).map(([surfaceId,rows]) => {
    rows.sort((a,b)=>lexical(a.sourceId,b.sourceId)||lexical(a.layerId,b.layerId)||lexical(a.id,b.id));
    const findings = rows.reduce((total,row)=>total+row.findingCodes.length,0);
    const unresolved = rows.filter(row=>row.decision!=='resolved').length;
    const missing = rows.reduce((total,row)=>total+row.missingFields.length,0);
    const blocking = rows.filter(row=>row.requiresAttention).length;
    return {surfaceId, recordCount:rows.length, unresolved, missingFields:missing,
      findings, blockingRecords:blocking, status:blocking?'needs-attention':'recorded-review-only', records:rows};
  });
  return {schema:HANDOFF_SCHEMA, title:ledger.title, selection:selection??UNKNOWN,
    summary:{views:groups.length,records:groups.reduce((n,x)=>n+x.recordCount,0),
      unresolved:groups.reduce((n,x)=>n+x.unresolved,0),
      blockingRecords:groups.reduce((n,x)=>n+x.blockingRecords,0),
      missingFields:groups.reduce((n,x)=>n+x.missingFields,0)},
    groups, explanation:'Only explicit supplied records are shown. This is not a legal or accessibility decision.'};
}
export function handoffJson(input, options={}) {return `${JSON.stringify(buildHandoff(input,options),null,2)}\n`;}
export function handoffText(input,locale='en',options={}) {
  const lang=locale==='fr'?'fr':'en', t=handoffCopy(lang), sep=lang==='fr'?'\u00a0:':':';
  const result=buildHandoff(input,options);
  const lines=[t.title,'',result.title,t.caution,'',
    `${t.records}${sep} ${result.summary.records}`,
    `${t.unresolved}${sep} ${result.summary.unresolved}`,
    `${t.missing}${sep} ${result.summary.missingFields}`,''];
  if (!result.groups.length) lines.push(t.noRows);
  for(const group of result.groups) {
    lines.push(`${t.view}${sep} ${group.surfaceId}`,`${t.reportStatus}${sep} ${group.status}`,
      `${t.unresolved}${sep} ${group.unresolved}`,`${t.blocking}${sep} ${group.blockingRecords}`,'');
    for(const row of group.records) {
      lines.push(`${t.records}${sep} ${row.id}`,`${t.scope}${sep} ${row.layerId} / ${row.sourceId} / ${row.category}`,
        `${t.current}${sep} ${row.current}`,`${t.proposed}${sep} ${row.proposed}`,
        `${t.sourceLink}${sep} ${row.source}`,`${t.licence}${sep} ${row.licence}`,
        `${t.retrieved}${sep} ${row.retrievedOn}`,`${t.tier}${sep} ${row.tier}`,
        `${t.priority}${sep} ${row.severity}`,`${t.decision}${sep} ${row.decision}`,
        `${t.reviewed}${sep} ${row.reviewedOn}`,`${t.reason}${sep} ${row.reason}`,
        `${t.notes}${sep} ${row.note}`,`${t.missing}${sep} ${row.missingFields.join(', ')||t.none}`,
        `${t.warnings}${sep} ${row.findingCodes.join(', ')||t.none}`,'');
    }
  }
  return `${lines.join('\n')}\n`;
}
