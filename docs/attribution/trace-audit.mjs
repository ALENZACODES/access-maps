import { UNKNOWN, OSM_CREDIT, parseTrace, availableNoticeSlots } from './trace-core.mjs';

const order = Object.freeze({block: 0, caution: 1, info: 2});
function finding(severity, code, path, detail = UNKNOWN) { return {severity, code, path, detail}; }
function add(out, severity, code, path, detail) { out.push(finding(severity, code, path, detail)); }
function unknown(value) { return value === UNKNOWN || value === '' || value === null || value === undefined; }
function isOsm(source) { return source.licence === 'ODbL' || /\b(?:odbl|open database licence|open database license)\b/iu.test(source.licence); }
function geometryNeedsCredit(layer, source) { return layer.geometrySourceIds.includes(source.id) && isOsm(source); }
function textHasCredit(text, credit) { return !unknown(credit) && text.includes(credit); }
function checkSource(out, source, included) {
  const path = `sources.${source.id}`;
  if (unknown(source.sourceUrl)) add(out, 'block', 'SOURCE_URL_UNKNOWN', `${path}.sourceUrl`);
  if (unknown(source.licence)) add(out, 'block', 'LICENCE_UNKNOWN', `${path}.licence`);
  if (unknown(source.licenceUrl)) add(out, 'block', 'LICENCE_URL_UNKNOWN', `${path}.licenceUrl`);
  if (unknown(source.credit)) add(out, 'block', 'CREDIT_UNKNOWN', `${path}.credit`);
  if (unknown(source.retrievedOn)) add(out, 'block', 'RETRIEVAL_UNKNOWN', `${path}.retrievedOn`);
  if (unknown(source.tier)) add(out, 'block', 'TIER_UNKNOWN', `${path}.tier`);
  if (source.permission !== 'yes') add(out, 'block', 'PERMISSION_UNSUPPORTED', `${path}.permission`, source.permission);
  if (isOsm(source) && source.credit !== OSM_CREDIT) add(out, 'block', 'OSM_CREDIT', `${path}.credit`, source.credit);
  if (!included) add(out, 'info', 'UNUSED_SOURCE', path);
}
function checkSurface(out, surface, included) {
  const path = `surfaces.${surface.id}`;
  if (unknown(surface.route)) add(out, 'block', 'ROUTE_UNKNOWN', `${path}.route`);
  for (const field of ['keyboard', 'screenReader', 'focusVisible']) {
    if (surface[field] !== 'yes') add(out, 'block', `ACCESS_${field.toUpperCase()}`, `${path}.${field}`, surface[field]);
  }
  if (surface.minimumTargetPx === UNKNOWN || surface.minimumTargetPx < 44) add(out, 'block', 'TARGET_TOO_SMALL_OR_UNKNOWN', `${path}.minimumTargetPx`, String(surface.minimumTargetPx));
  if (surface.mapShown === UNKNOWN) add(out, 'block', 'MAP_STATUS_UNKNOWN', `${path}.mapShown`);
  if (!included) add(out, 'info', 'UNUSED_SURFACE', path);
}
function checkLayer(out, layer, sources, surfaces, notices) {
  const path = `layers.${layer.id}`;
  if (layer.sourceIds.length === 0) add(out, 'block', 'NO_SOURCES', `${path}.sourceIds`);
  if (layer.surfaceIds.length === 0) add(out, 'block', 'NO_SURFACES', `${path}.surfaceIds`);
  if (layer.mode === UNKNOWN) add(out, 'block', 'MODE_UNKNOWN', `${path}.mode`);
  if ((layer.mode === 'basemap' || layer.mode === 'route') && !layer.geometrySourceIds.length) add(out, 'block', 'GEOMETRY_SOURCE_UNKNOWN', `${path}.geometrySourceIds`);
  const layerNotices = notices.filter(n => n.layerId === layer.id);
  const layerSources = sources.filter(s => layer.sourceIds.includes(s.id));
  const families = new Set(layerSources.map(s => isOsm(s) ? 'ODbL' : s.licence));
  if (families.has('ODbL') && families.size > 1) add(out, 'caution', 'MIXED_LICENCES', path);
  for (const source of layerSources) {
    for (const surfaceId of layer.surfaceIds) {
      const surface = surfaces.find(s => s.id === surfaceId);
      const notice = layerNotices.find(n => n.surfaceId === surfaceId && n.sourceId === source.id);
      if (!notice) { add(out, 'block', 'MISSING_NOTICE', `${path}.${surfaceId}.${source.id}`); continue; }
      const np = `notices.${notice.id}`;
      if (unknown(notice.text)) add(out, 'block', 'NOTICE_TEXT_UNKNOWN', `${np}.text`);
      else if (!textHasCredit(notice.text, source.credit)) add(out, 'block', 'CREDIT_NOT_IN_NOTICE', `${np}.text`, source.id);
      if (notice.visible !== 'yes') add(out, 'block', 'NOTICE_VISIBILITY', `${np}.visible`, notice.visible);
      if (notice.readable !== 'yes') add(out, 'block', 'NOTICE_READING', `${np}.readable`, notice.readable);
      if (notice.focusable !== 'yes') add(out, 'block', 'NOTICE_KEYBOARD', `${np}.focusable`, notice.focusable);
      if (unknown(notice.observedOn)) add(out, 'block', 'OBSERVATION_DATE_UNKNOWN', `${np}.observedOn`);
      if (notice.placement === UNKNOWN || notice.placement === 'not-shown') add(out, 'block', 'PLACEMENT_MISSING', `${np}.placement`, notice.placement);
      const isMap = surface.mapShown === 'yes' && (layer.mode === 'basemap' || layer.mode === 'overlay' || layer.mode === 'route');
      if (isMap && geometryNeedsCredit(layer, source) && notice.placement !== 'adjacent') add(out, 'block', 'OSM_ADJACENCY', `${np}.placement`, notice.placement);
      if (isMap && notice.placement === 'details-only') add(out, 'caution', 'CREDIT_BEHIND_DETAILS', `${np}.placement`);
    }
  }
}

/** Treat only explicitly included layers as publication candidates; all others are held. */
export function auditTrace(input) {
  const trace = parseTrace(input);
  const findings = [];
  const included = trace.layers.filter(layer => layer.status === 'included');
  const includedSources = new Set(included.flatMap(layer => layer.sourceIds));
  const includedSurfaces = new Set(included.flatMap(layer => layer.surfaceIds));
  for (const source of trace.sources) if (includedSources.has(source.id)) checkSource(findings, source, true);
  for (const surface of trace.surfaces) if (includedSurfaces.has(surface.id)) checkSurface(findings, surface, true);
  for (const layer of included) checkLayer(findings, layer, trace.sources, trace.surfaces, trace.notices);
  for (const slot of availableNoticeSlots(trace)) if (included.some(layer => layer.id === slot.layerId) && !findings.some(f => f.code === 'MISSING_NOTICE' && f.path === `layers.${slot.layerId}.${slot.surfaceId}.${slot.sourceId}`)) add(findings, 'block', 'MISSING_NOTICE', `layers.${slot.layerId}.${slot.surfaceId}.${slot.sourceId}`);
  for (const layer of trace.layers) if (layer.status !== 'included') add(findings, 'info', 'LAYER_HELD', `layers.${layer.id}`, layer.status);
  for (const source of trace.sources) if (!includedSources.has(source.id)) add(findings, 'info', 'UNUSED_SOURCE', `sources.${source.id}`);
  for (const surface of trace.surfaces) if (!includedSurfaces.has(surface.id)) add(findings, 'info', 'UNUSED_SURFACE', `surfaces.${surface.id}`);
  for (const notice of trace.notices) if (!included.some(layer => layer.id === notice.layerId)) add(findings, 'info', 'NOTICE_HELD', `notices.${notice.id}`);
  findings.sort((a, b) => order[a.severity] - order[b.severity] || a.path.localeCompare(b.path) || a.code.localeCompare(b.code));
  const counts = {block: 0, caution: 0, info: 0};
  for (const issue of findings) counts[issue.severity]++;
  return {schema: 'map-notice-trace-report/1', title: trace.title, publication: included.length ? (counts.block ? 'blocked' : 'review-needed') : 'no-candidates', counts, findings, includedLayers: included.map(layer => layer.id)};
}

/** Semantic before/after comparison, excluding held records from blocking release. */
export function compareTraces(previous, candidate) {
  const before = parseTrace(previous);
  const after = parseTrace(candidate);
  const findings = [];
  const previousSources = new Map(before.sources.map(row => [row.id, row]));
  const previousSurfaces = new Map(before.surfaces.map(row => [row.id, row]));
  const previousLayers = new Map(before.layers.map(row => [row.id, row]));
  const nextSources = new Map(after.sources.map(row => [row.id, row]));
  const nextSurfaces = new Map(after.surfaces.map(row => [row.id, row]));
  const nextLayers = new Map(after.layers.map(row => [row.id, row]));
  const priorIncluded = before.layers.filter(layer => layer.status === 'included');
  for (const layer of priorIncluded) {
    const next = nextLayers.get(layer.id);
    if (!next || next.status !== 'included') add(findings, 'block', 'INCLUDED_LAYER_REMOVED', `layers.${layer.id}`);
    else {
      for (const sourceId of layer.sourceIds) if (!next.sourceIds.includes(sourceId)) add(findings, 'block', 'LAYER_SOURCE_REMOVED', `layers.${layer.id}.sourceIds`, sourceId);
      for (const surfaceId of layer.surfaceIds) if (!next.surfaceIds.includes(surfaceId)) add(findings, 'block', 'LAYER_SURFACE_REMOVED', `layers.${layer.id}.surfaceIds`, surfaceId);
      for (const sourceId of layer.geometrySourceIds) if (!next.geometrySourceIds.includes(sourceId)) add(findings, 'block', 'GEOMETRY_PROVENANCE_REMOVED', `layers.${layer.id}.geometrySourceIds`, sourceId);
    }
    for (const sourceId of layer.sourceIds) {
      const prior = previousSources.get(sourceId);
      const current = nextSources.get(sourceId);
      if (!current) { add(findings, 'block', 'SOURCE_REMOVED', `sources.${sourceId}`); continue; }
      for (const field of ['sourceUrl', 'licence', 'licenceUrl', 'credit','retrievedOn','tier','permission']) {
        if (prior[field] !== current[field]) add(findings, field === 'retrievedOn' && current[field] !== UNKNOWN ? 'caution' : 'block', 'SOURCE_EVIDENCE_CHANGED', `sources.${sourceId}.${field}`);
      }
    }
    for (const surfaceId of layer.surfaceIds) {
      const prior = previousSurfaces.get(surfaceId);
      const current = nextSurfaces.get(surfaceId);
      if (!current) { add(findings, 'block', 'SURFACE_REMOVED', `surfaces.${surfaceId}`); continue; }
      for (const field of ['route','locale','keyboard','screenReader','focusVisible','minimumTargetPx']) if (prior[field] !== current[field]) add(findings, 'caution', 'SURFACE_CHANGED', `surfaces.${surfaceId}.${field}`);
    }
    for (const oldNotice of before.notices.filter(n => n.layerId === layer.id)) {
      const newer = after.notices.find(n => n.layerId === oldNotice.layerId && n.surfaceId === oldNotice.surfaceId && n.sourceId === oldNotice.sourceId && n.locale === oldNotice.locale);
      if (!newer) { add(findings, 'block', 'NOTICE_REMOVED', `notices.${oldNotice.id}`); continue; }
      for (const field of ['text','placement','visible','focusable','readable','observedOn']) if (oldNotice[field] !== newer[field]) add(findings, 'caution', 'NOTICE_CHANGED', `notices.${newer.id}.${field}`);
    }
  }
  const audit = auditTrace(after);
  findings.push(...audit.findings);
  findings.sort((a,b) => order[a.severity] - order[b.severity] || a.path.localeCompare(b.path) || a.code.localeCompare(b.code));
  const counts = {block: 0, caution: 0, info: 0};
  for (const issue of findings) counts[issue.severity]++;
  return {schema: 'map-notice-trace-comparison/1', publication: counts.block ? 'blocked' : 'review-needed', counts, findings};
}
