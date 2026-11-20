import { UNKNOWN, OSM_CREDIT, parseTrace } from './trace-core.mjs';

/** Rows are derived from actual source/layer/surface relationships; never synthesize notices. */
export function buildTraceMatrix(input, options = {}) {
  const trace = parseTrace(input);
  const includedOnly = options.includedOnly !== false;
  const source = options.sourceId ?? null;
  const surface = options.surfaceId ?? null;
  if (source !== null && !trace.sources.some(item => item.id === source)) return [];
  if (surface !== null && !trace.surfaces.some(item => item.id === surface)) return [];
  const sources = new Map(trace.sources.map(item => [item.id, item]));
  const surfaces = new Map(trace.surfaces.map(item => [item.id, item]));
  const notices = new Map(trace.notices.map(item => [[item.layerId,item.surfaceId,item.sourceId].join('\u001f'), item]));
  const rows = [];
  for (const layer of trace.layers) {
    if (includedOnly && layer.status !== 'included') continue;
    for (const surfaceId of layer.surfaceIds) {
      if (surface && surfaceId !== surface) continue;
      const display = surfaces.get(surfaceId);
      for (const sourceId of layer.sourceIds) {
        if (source && sourceId !== source) continue;
        const origin = sources.get(sourceId);
        const notice = notices.get([layer.id,surfaceId,sourceId].join('\u001f'));
        const mapGeometry = layer.geometrySourceIds.includes(sourceId) && display.mapShown === 'yes';
        const osm = origin.credit === OSM_CREDIT || /\bODbL\b/iu.test(origin.licence);
        let creditState = 'UNKNOWN';
        if (notice) {
          creditState = notice.text === UNKNOWN ? UNKNOWN : notice.text.includes(origin.credit) && origin.credit !== UNKNOWN ? 'present' : 'missing';
        }
        const displayState = !notice ? 'missing' : notice.visible !== 'yes' || notice.readable !== 'yes' || notice.focusable !== 'yes' ? 'incomplete' : 'documented';
        const adjacency = !mapGeometry || !osm ? 'not-required' : !notice ? 'missing' : notice.placement === 'adjacent' ? 'documented' : 'incomplete';
        rows.push({
          layerId: layer.id,
          layer: layer.label,
          mode: layer.mode,
          status: layer.status,
          sourceId,
          source: origin.name,
          sourceUrl: origin.sourceUrl,
          licence: origin.licence,
          licenceUrl: origin.licenceUrl,
          retrievedOn: origin.retrievedOn,
          tier: origin.tier,
          permission: origin.permission,
          surfaceId,
          surface: display.label,
          locale: display.locale,
          route: display.route,
          noticeId: notice?.id ?? UNKNOWN,
          noticeText: notice?.text ?? UNKNOWN,
          observedOn: notice?.observedOn ?? UNKNOWN,
          placement: notice?.placement ?? UNKNOWN,
          creditState,
          displayState,
          adjacency,
        });
      }
    }
  }
  return rows;
}

/** One concise rollup per view/language. */
export function matrixBySurface(input, options = {}) {
  const rows = buildTraceMatrix(input, options);
  const groups = new Map();
  for (const row of rows) {
    let group = groups.get(row.surfaceId);
    if (!group) {
      group = {surfaceId:row.surfaceId, surface:row.surface, route:row.route, locale:row.locale, total:0, documented:0, missing:0, incomplete:0, adjacentRequired:0, adjacentDocumented:0, sourceIds:[]};
      groups.set(row.surfaceId,group);
    }
    group.total++;
    if (row.displayState === 'documented') group.documented++;
    else if (row.displayState === 'missing') group.missing++;
    else group.incomplete++;
    if (row.adjacency !== 'not-required') {
      group.adjacentRequired++;
      if (row.adjacency === 'documented') group.adjacentDocumented++;
    }
    if (!group.sourceIds.includes(row.sourceId)) group.sourceIds.push(row.sourceId);
  }
  return [...groups.values()];
}

/** Exact source evidence per visible view, independent of provider guesses. */
export function matrixBySource(input, options = {}) {
  const rows = buildTraceMatrix(input, options);
  const groups = new Map();
  for (const row of rows) {
    let group = groups.get(row.sourceId);
    if (!group) {
      group = {sourceId:row.sourceId, source:row.source, licence:row.licence, retrievedOn:row.retrievedOn, tier:row.tier, permission:row.permission, displayedOn:[], expectedNotices:0, recordedNotices:0, missingNotices:0};
      groups.set(row.sourceId,group);
    }
    group.expectedNotices++;
    if (row.noticeId === UNKNOWN) group.missingNotices++;
    else group.recordedNotices++;
    if (!group.displayedOn.includes(row.surfaceId)) group.displayedOn.push(row.surfaceId);
  }
  return [...groups.values()];
}

function cleanTsv(value) {
  // Spreadsheet viewers must not interpret imported notice text as formulas.
  const text = String(value ?? UNKNOWN).replace(/[\t\r\n]/gu, ' ').replace(/[\u0000-\u001f\u007f]/gu, '');
  return /^[\s]*[=+@-]/u.test(text) ? `'${text}` : text;
}
export const MATRIX_COLUMNS = Object.freeze([
  'layerId','layer','mode','status','sourceId','source','sourceUrl','licence',
  'licenceUrl','retrievedOn','tier','permission','surfaceId','surface','locale','route',
  'noticeId','noticeText','observedOn','placement','creditState','displayState','adjacency',
]);
export function matrixTsv(rows) {
  if (!Array.isArray(rows)) throw new TypeError('Expected matrix rows');
  const lines = [MATRIX_COLUMNS.join('\t')];
  for (const row of rows) {
    if (!row || typeof row !== 'object') throw new TypeError('Invalid row');
    lines.push(MATRIX_COLUMNS.map(column => cleanTsv(row[column])).join('\t'));
  }
  return `${lines.join('\n')}\n`;
}
export function matrixJson(rows) {
  if (!Array.isArray(rows)) throw new TypeError('Expected matrix rows');
  return `${JSON.stringify({schema:'map-notice-trace-matrix/1',columns:MATRIX_COLUMNS,rows},null,2)}\n`;
}
