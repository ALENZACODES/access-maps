import {parseInventory, UNKNOWN, OSM_CREDIT} from './dependency-core.mjs';

/** Finds attribution obligations through the complete dependency graph. */
const severityOrder = {block: 0, attention: 1, information: 2};
const item = (code, severity, surfaceId = UNKNOWN, assetId = UNKNOWN, sourceId = UNKNOWN, detail = UNKNOWN) =>
  ({code, severity, surfaceId, assetId, sourceId, detail});
function add(output, code, severity, surfaceId, assetId, sourceId, detail) {
  output.push(item(code, severity, surfaceId, assetId, sourceId, detail));
}
function isOsm(source) {
  return source.licence === 'ODbL' || /\b(?:odbl|open database licen[cs]e)\b/iu.test(source.licence);
}
export function dependencyClosure(input, assetIds) {
  const data = parseInventory(input);
  const byId = new Map(data.assets.map(asset => [asset.id, asset]));
  const selected = new Set();
  function walk(id) {
    if (!byId.has(id)) throw new RangeError(`Unknown asset identifier: ${id}`);
    if (selected.has(id)) return;
    selected.add(id);
    for (const dependency of byId.get(id).dependsOn) walk(dependency);
  }
  for (const id of assetIds) walk(id);
  return data.assets.filter(asset => selected.has(asset.id));
}
export function surfaceProjection(input, surfaceId) {
  const data = parseInventory(input);
  const surface = data.surfaces.find(view => view.id === surfaceId);
  if (!surface) throw new RangeError(`Unknown surface identifier: ${surfaceId}`);
  const assets = dependencyClosure(data, surface.assetIds);
  const sourceIds = new Set(assets.flatMap(asset => asset.sourceIds));
  return {
    surface,
    assets,
    sources: data.sources.filter(source => sourceIds.has(source.id)),
    includedAssets: assets.filter(asset => asset.mode === 'included'),
    heldDependencies: assets.filter(asset => asset.mode !== 'included'),
    declaredNotices: surface.notices,
  };
}
export function auditInventory(input) {
  const data = parseInventory(input);
  const findings = [];
  const projections = [];
  const usedAssets = new Set();
  const usedSources = new Set();
  for (const surface of data.surfaces) {
    const projection = surfaceProjection(data, surface.id);
    const assetIds = projection.assets.map(asset => asset.id);
    const sourceIds = projection.sources.map(source => source.id);
    const noticeBySource = new Map(surface.notices.map(notice => [notice.sourceId, notice]));
    for (const asset of projection.assets) usedAssets.add(asset.id);
    for (const source of projection.sources) usedSources.add(source.id);
    if (surface.route === UNKNOWN) add(findings, 'ROUTE_UNKNOWN', 'block', surface.id);
    if (surface.assetIds.length === 0) add(findings, 'NO_ASSETS', 'attention', surface.id);
    for (const field of ['keyboard', 'screenReader', 'focusVisible']) {
      if (surface[field] !== 'yes') add(findings, `ACCESS_${field.toUpperCase()}`, 'block', surface.id, UNKNOWN, UNKNOWN, surface[field]);
    }
    if (surface.minimumTargetPx === UNKNOWN) add(findings, 'TARGET_UNKNOWN', 'block', surface.id);
    else if (surface.minimumTargetPx < 44) add(findings, 'TARGET_TOO_SMALL', 'block', surface.id, UNKNOWN, UNKNOWN, String(surface.minimumTargetPx));
    for (const asset of projection.assets) {
      if (asset.mode !== 'included') add(findings, 'HELD_DEPENDENCY', 'block', surface.id, asset.id);
      if (asset.path === UNKNOWN) add(findings, 'ASSET_PATH_UNKNOWN', 'block', surface.id, asset.id);
      if (asset.bytes === UNKNOWN) add(findings, 'ASSET_BYTES_UNKNOWN', 'information', surface.id, asset.id);
      if (asset.sourceIds.length === 0 && asset.dependsOn.length === 0) add(findings, 'ASSET_ORIGIN_UNKNOWN', 'block', surface.id, asset.id);
    }
    for (const source of projection.sources) {
      const common = [surface.id, UNKNOWN, source.id];
      if (source.sourceUrl === UNKNOWN) add(findings, 'SOURCE_URL_UNKNOWN', 'block', ...common);
      if (source.licence === UNKNOWN) add(findings, 'LICENCE_UNKNOWN', 'block', ...common);
      if (source.licenceUrl === UNKNOWN) add(findings, 'LICENCE_URL_UNKNOWN', 'block', ...common);
      if (source.retrievedOn === UNKNOWN) add(findings, 'RETRIEVAL_UNKNOWN', 'block', ...common);
      if (source.tier === UNKNOWN) add(findings, 'TIER_UNKNOWN', 'block', ...common);
      if (source.permission !== 'yes') add(findings, 'PERMISSION_UNSUPPORTED', 'block', ...common, source.permission);
      if (source.credit === UNKNOWN) add(findings, 'CREDIT_UNKNOWN', 'block', ...common);
      if (isOsm(source) && source.credit !== OSM_CREDIT) add(findings, 'OSM_CREDIT_INEXACT', 'block', ...common);
      const notice = noticeBySource.get(source.id);
      if (!notice) {
        add(findings, 'NOTICE_MISSING', 'block', ...common);
        continue;
      }
      if (notice.text === UNKNOWN) add(findings, 'NOTICE_TEXT_UNKNOWN', 'block', ...common);
      else if (source.credit !== UNKNOWN && !notice.text.includes(source.credit)) add(findings, 'CREDIT_NOT_DISPLAYED', 'block', ...common);
      if (notice.visible !== 'yes') add(findings, 'NOTICE_NOT_VISIBLE', 'block', ...common, notice.visible);
      if (notice.readable !== 'yes') add(findings, 'NOTICE_NOT_READABLE', 'block', ...common, notice.readable);
      if (notice.observedOn === UNKNOWN) add(findings, 'NOTICE_DATE_UNKNOWN', 'block', ...common);
      if (notice.position === 'absent' || notice.position === UNKNOWN) add(findings, 'NOTICE_PLACEMENT_UNKNOWN', 'block', ...common);
      const mapUsingOsm = isOsm(source) && projection.assets.some(asset =>
        asset.sourceIds.includes(source.id) && ['map', 'tile', 'route'].includes(asset.kind));
      if (mapUsingOsm && notice.position !== 'adjacent') add(findings, 'OSM_NOT_ADJACENT', 'block', ...common);
    }
    for (const notice of surface.notices) {
      if (!sourceIds.includes(notice.sourceId)) add(findings, 'UNUSED_NOTICE', 'attention', surface.id, UNKNOWN, notice.sourceId);
    }
    const licenceFamilies = new Set(projection.sources.map(source => isOsm(source) ? 'ODbL' : source.licence));
    if (licenceFamilies.has('ODbL') && licenceFamilies.size > 1) {
      add(findings, 'MIXED_LICENCE_FAMILIES', 'attention', surface.id);
    }
    projections.push({surfaceId: surface.id, route: surface.route, locale: surface.locale, assetIds,
      sourceIds, notices: surface.notices.length, requiredNotices: sourceIds.length});
  }
  for (const asset of data.assets) if (!usedAssets.has(asset.id) && asset.mode === 'included') {
    add(findings, 'INCLUDED_ASSET_UNUSED', 'attention', UNKNOWN, asset.id);
  }
  for (const source of data.sources) if (!usedSources.has(source.id)) {
    add(findings, 'SOURCE_UNUSED', 'information', UNKNOWN, UNKNOWN, source.id);
  }
  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] ||
    a.surfaceId.localeCompare(b.surfaceId) || a.assetId.localeCompare(b.assetId) ||
    a.sourceId.localeCompare(b.sourceId) || a.code.localeCompare(b.code));
  const counts = {block: 0, attention: 0, information: 0};
  for (const finding of findings) counts[finding.severity] += 1;
  return {schema: 'attribution-dependency-audit/1', title: data.title, counts, findings, projections,
    status: counts.block ? 'held' : projections.length ? 'manual-review' : 'no-surfaces'};
}
export function compareInventories(before, after) {
  const old = parseInventory(before);
  const next = parseInventory(after);
  const oldById = new Map(old.sources.map(source => [source.id, source]));
  const nextById = new Map(next.sources.map(source => [source.id, source]));
  const alerts = [];
  for (const source of old.sources) {
    const current = nextById.get(source.id);
    if (!current) {alerts.push({code: 'SOURCE_REMOVED', id: source.id, field: UNKNOWN});continue;}
    for (const field of ['sourceUrl','licence','licenceUrl','retrievedOn','tier','permission','credit']) {
      if (source[field] !== current[field]) alerts.push({code: 'SOURCE_CHANGED', id: source.id, field});
    }
  }
  const oldAssets = new Map(old.assets.map(asset => [asset.id, asset]));
  const newAssets = new Map(next.assets.map(asset => [asset.id, asset]));
  for (const asset of old.assets) {
    const current = newAssets.get(asset.id);
    if (!current) { alerts.push({code: 'ASSET_REMOVED', id: asset.id, field: UNKNOWN});continue; }
    for (const field of ['path','kind','mode','bytes']) {
      if (asset[field] !== current[field]) alerts.push({code: 'ASSET_CHANGED', id: asset.id, field});
    }
    for (const field of ['sourceIds','dependsOn']) {
      if (JSON.stringify([...asset[field]].sort()) !== JSON.stringify([...current[field]].sort())) {
        alerts.push({code: 'ASSET_LINKS_CHANGED', id: asset.id, field});
      }
    }
  }
  const newSurfaces = new Map(next.surfaces.map(surface => [surface.id, surface]));
  for (const surface of old.surfaces) {
    const current = newSurfaces.get(surface.id);
    if (!current) {alerts.push({code:'SURFACE_REMOVED', id:surface.id, field:UNKNOWN});continue;}
    for (const field of ['route', 'locale', 'keyboard', 'screenReader', 'focusVisible', 'minimumTargetPx']) {
      if (surface[field] !== current[field]) alerts.push({code: 'SURFACE_CHANGED', id: surface.id, field});
    }
    if (JSON.stringify(surface.notices) !== JSON.stringify(current.notices)) {
      alerts.push({code: 'NOTICES_CHANGED', id: surface.id, field: 'notices'});
    }
    if (JSON.stringify([...surface.assetIds].sort()) !== JSON.stringify([...current.assetIds].sort())) {
      alerts.push({code:'SURFACE_ASSETS_CHANGED', id:surface.id, field:'assetIds'});
    }
  }
  for (const source of next.sources) if (!oldById.has(source.id)) alerts.push({code:'SOURCE_ADDED',id:source.id,field:UNKNOWN});
  for (const asset of next.assets) if (!oldAssets.has(asset.id)) alerts.push({code:'ASSET_ADDED',id:asset.id,field:UNKNOWN});
  const report = auditInventory(next);
  const previousAudit = auditInventory(old);
  const signature = finding => `${finding.code}|${finding.surfaceId}|${finding.assetId}|${finding.sourceId}`;
  const prior = new Set(previousAudit.findings.filter(f=>f.severity==='block').map(signature));
  const current = new Set(report.findings.filter(f=>f.severity==='block').map(signature));
  const introduced = report.findings.filter(f=>f.severity==='block' && !prior.has(signature(f)));
  const resolved = previousAudit.findings.filter(f=>f.severity==='block' && !current.has(signature(f)));
  alerts.sort((a,b)=>a.id.localeCompare(b.id)||a.code.localeCompare(b.code)||a.field.localeCompare(b.field));
  return {schema:'attribution-dependency-comparison/1',alerts,introduced,resolved,before:previousAudit.counts,after:report.counts,
    needsReview:alerts.length > 0 || introduced.length > 0};
}
