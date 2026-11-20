import { parseJournal, observationKey, UNKNOWN } from './observation-core.mjs';
import { auditJournal, REQUIRED_METHODS } from './observation-audit.mjs';
/** Coverage matrix is a human evidence index, not a travel accessibility score. */
export function buildObservationMatrix(input) {
  const journal = parseJournal(input);
  const audit = auditJournal(journal);
  const observations = new Map();
  for (const item of journal.observations) {
    const key = observationKey(item.viewId, item.sourceId, item.method);
    if (!observations.has(key)) observations.set(key, []);
    observations.get(key).push(item);
  }
  const rows = [];
  for (const view of journal.views) {
    for (const sourceId of view.sourceIds) {
      const source = journal.sources.find(x => x.id === sourceId);
      for (const method of REQUIRED_METHODS) {
        const matching = observations.get(observationKey(view.id,sourceId,method)) ?? [];
        const issues = audit.findings.filter(item => item.viewId === view.id && item.sourceId === sourceId &&
          (item.method === method || item.method === UNKNOWN));
        const blocking = issues.filter(x => x.severity === 'block').length;
        rows.push({
          viewId:view.id,viewTitle:view.title,route:view.route,viewLocale:view.locale,
          included:view.included,sourceId,provider:source.provider,licence:source.licence,
          retrievedOn:source.retrievedOn,tier:source.tier,method,
          observationIds:matching.map(x=>x.id),
          dates:matching.map(x=>x.date),
          credits:matching.map(x=>x.creditSeen),
          placements:matching.map(x=>x.placement),
          evidence:matching.map(x=>x.evidence),
          blocking: view.included === 'yes' ? blocking : 0,
          state:view.included !== 'yes' ? 'not-included' : !matching.length ? 'missing' : blocking ? 'gap' : 'recorded',
        });
      }
    }
  }
  return {schema:'map-attribution-observation-matrix/1',rows,
    summary:{rows:rows.length,missing:rows.filter(x=>x.state==='missing').length,
      gaps:rows.filter(x=>x.state==='gap').length,recorded:rows.filter(x=>x.state==='recorded').length,
      notIncluded:rows.filter(x=>x.state==='not-included').length}};
}
export function filterMatrix(matrix, options = {}) {
  const {viewId,sourceId,method,state}=options;
  return matrix.rows.filter(row=>(!viewId||row.viewId===viewId)&&(!sourceId||row.sourceId===sourceId)&&
    (!method||row.method===method)&&(!state||row.state===state));
}
const HEADERS = ['View ID','View title','View route','Language','Included','Source ID','Provider','Licence',
  'Retrieved on','Evidence tier','Method','Observation IDs','Observation dates','Credit observed',
  'Placements','Evidence','Blocking gaps','Record state'];
/** Safe spreadsheet text export: neutralize potential formula cells before TSV quoting. */
export function tsvCell(value) {
  let text=String(value??UNKNOWN).replace(/\u0000/gu,'');
  if (/^[\s\u0009]*[=+@-]/u.test(text)) text=`'${text}`;
  return `"${text.replace(/"/gu,'""')}"`;
}
export function matrixTsv(matrix) {
  const lines=[HEADERS.map(tsvCell).join('\t')];
  for(const row of matrix.rows) {
    const values=[row.viewId,row.viewTitle,row.route,row.viewLocale,row.included,row.sourceId,row.provider,
      row.licence,row.retrievedOn,row.tier,row.method,row.observationIds.join('; '),row.dates.join('; '),
      row.credits.join('; '),row.placements.join('; '),row.evidence.join('; '),row.blocking,row.state];
    lines.push(values.map(tsvCell).join('\t'));
  }
  return `${lines.join('\n')}\n`;
}
