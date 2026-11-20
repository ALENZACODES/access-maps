/** Release-blocking obligations for an explicitly supplied offline distribution. */
import { SOURCES, METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE, METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR } from './attribution-utils.mjs';
import { graphIndex, distributionMatrix, dependencyCycles } from './distribution-graph.mjs';
import { UNKNOWN } from './distribution-core.mjs';

export const DISTRIBUTION_BUDGET_BYTES = 4_141_875;
const compareNotice = (large, small) => large.normalize('NFC').replace(/\s+/gu, ' ').includes(small.normalize('NFC').replace(/\s+/gu, ' '));
function noticeRequirements(source, locale) {
  switch (source.provider) {
    case 'osm': return [SOURCES.osm.notices.en[0], SOURCES.osm.notices.en[1]];
    case 'metrolinx-aua': return [METROLINX_AUA_LEGEND, METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR];
    case 'metrolinx-ogl': return [METROLINX_OGL_NOTICE];
    case 'ltc': return [SOURCES.ltc.notices[locale][0]];
    default: return [];
  }
}
export function auditDistribution(manifest, options = {}) {
  const index = graphIndex(manifest);
  const matrix = distributionMatrix(manifest);
  const findings = [];
  const push = (code, level, path, detail, viewId = null, sourceId = null) => findings.push({ code, level, path, detail, viewId, sourceId });
  const requireOffline = options.requireOffline !== false;
  const requirePairs = options.requirePairs === true;
  const minTarget = options.minimumTargetPx ?? 44;
  const budget = options.maxInstallBytes ?? DISTRIBUTION_BUDGET_BYTES;
  if (!Number.isSafeInteger(minTarget) || minTarget < 44) throw new Error('Minimum target must be at least 44');
  if (!Number.isSafeInteger(budget) || budget < 0) throw new Error('Invalid installation budget');
  if (!manifest.views.length) push('NO_VIEWS', 'block', 'views', 'No publication views');
  if (!manifest.sources.length) push('NO_SOURCES', 'block', 'sources', 'No recorded source');
  let total = 0;
  let unknownBytes = false;
  for (const source of manifest.sources) {
    if (source.state !== 'included') continue;
    const path = `sources.${source.id}`;
    if (source.permission !== 'YES') push('PERMISSION_UNRESOLVED', 'block', path, source.permission, null, source.id);
    if (source.licenceEvidence !== 'YES') push('LICENCE_EVIDENCE_UNRESOLVED', 'block', path, source.licenceEvidence, null, source.id);
    if (source.sourceUrl === UNKNOWN) push('SOURCE_URL_UNKNOWN', 'block', path, UNKNOWN, null, source.id);
    if (source.licenceUrl === UNKNOWN) push('LICENCE_URL_UNKNOWN', 'block', path, UNKNOWN, null, source.id);
    if (source.termsDate === UNKNOWN) push('TERMS_DATE_UNKNOWN', 'block', path, UNKNOWN, null, source.id);
    if (source.acquiredDate === UNKNOWN) push('ACQUISITION_DATE_UNKNOWN', 'block', path, UNKNOWN, null, source.id);
    if (source.tier === UNKNOWN) push('TIER_UNKNOWN', 'block', path, UNKNOWN, null, source.id);
    if (source.datasetDate === UNKNOWN) push('DATASET_DATE_UNKNOWN', 'info', path, UNKNOWN, null, source.id);
    if (!source.notice.trim()) push('SOURCE_NOTICE_EMPTY', 'block', path, 'Missing source notice', null, source.id);
    for (const requirement of noticeRequirements(source, 'en')) if (!compareNotice(source.notice, requirement)) push('SOURCE_NOTICE_INCOMPLETE', 'block', path, requirement, null, source.id);
    if (source.provider === 'osm' && !/ODbL|Open Database License/u.test(source.licenceName)) push('ODBL_LICENCE_MISSING', 'block', path, source.licenceName, null, source.id);
    if (source.provider === 'metrolinx-aua' && !/Access and Use|AUA/u.test(source.licenceName)) push('AUA_LICENCE_MISMATCH', 'block', path, source.licenceName, null, source.id);
    if (source.provider === 'metrolinx-ogl' && !/Open Government|OGL/u.test(source.licenceName)) push('OGL_LICENCE_MISMATCH', 'block', path, source.licenceName, null, source.id);
    if (source.provider === 'ltc' && !/LTC|London Transit/u.test(source.licenceName)) push('LTC_LICENCE_MISMATCH', 'block', path, source.licenceName, null, source.id);
    if (source.provider === 'other' && !/(?:ODbL|Open Database License|Open Government Licence|OGL|Creative Commons Attribution|CC BY|Apache-2\.0|MIT Licence|MIT License|BSD-3-Clause|ISC License|ISC Licence)/iu.test(source.licenceName)) push('LICENCE_NOT_OPEN', 'block', path, source.licenceName, null, source.id);
  }
  for (const asset of manifest.assets) {
    const path = `assets.${asset.id}`;
    if (asset.state === 'included') {
      if (asset.bytes === UNKNOWN) { unknownBytes = true; push('ASSET_SIZE_UNKNOWN', 'block', path, UNKNOWN); }
      else total += asset.bytes;
      if (asset.sha256 === UNKNOWN) push('ASSET_HASH_UNKNOWN', 'block', path, UNKNOWN);
    }
    for (const dependency of asset.dependencyIds) {
      if (!index.assets.has(dependency)) push('ASSET_DEPENDENCY_MISSING', 'block', path, dependency);
      else if (asset.state === 'included' && index.assets.get(dependency).state !== 'included') push('ASSET_DEPENDENCY_HELD', 'block', path, dependency);
    }
    for (const sourceId of asset.sourceIds) {
      if (!index.sources.has(sourceId)) push('ASSET_SOURCE_MISSING', 'block', path, sourceId, null, sourceId);
      else if (asset.state === 'included' && index.sources.get(sourceId).state !== 'included') push('ASSET_SOURCE_HELD', 'block', path, sourceId, null, sourceId);
    }
  }
  if (total > budget) push('INSTALL_BUDGET_EXCEEDED', 'block', 'assets', `${total} > ${budget}`);
  if (!Number.isSafeInteger(total)) push('INSTALL_SIZE_OVERFLOW', 'block', 'assets', 'Unsafe byte total');
  for (const cycle of dependencyCycles(manifest.assets)) push('DEPENDENCY_CYCLE', 'block', `assets.${cycle[0]}`, cycle.join(' -> '));
  for (const view of manifest.views) {
    const path = `views.${view.id}`;
    const row = matrix.find(entry => entry.viewId === view.id);
    if (!row) continue;
    if (!view.assetIds.length) push('VIEW_NO_ASSETS', 'block', path, 'View needs at least one asset', view.id);
    if (!view.sourceIds.length) push('VIEW_NO_SOURCES', 'block', path, 'View needs declared sources', view.id);
    for (const id of row.missingAssetIds) push('VIEW_ASSET_MISSING', 'block', path, id, view.id);
    for (const id of row.missingDeclarations) push('VIEW_SOURCE_UNDECLARED', 'block', path, id, view.id, id);
    for (const id of row.unusedDeclarations) push('VIEW_SOURCE_UNLINKED', 'block', path, id, view.id, id);
    for (const id of row.assetIds) if (index.assets.get(id).state !== 'included') push('VIEW_ASSET_HELD', 'block', path, id, view.id);
    for (const id of view.sourceIds) {
      const source = index.sources.get(id);
      if (!source) { push('VIEW_SOURCE_UNKNOWN', 'block', path, id, view.id, id); continue; }
      if (source.state !== 'included') push('VIEW_SOURCE_NOT_INCLUDED', 'block', path, id, view.id, id);
      for (const requirement of noticeRequirements(source, view.locale)) {
        if (!compareNotice(view.noticeText, requirement)) push('VIEW_NOTICE_MISSING', 'block', path, requirement, view.id, id);
      }
    }
    if (view.noticeVisible !== 'YES') push('VIEW_NOTICE_VISIBILITY_UNKNOWN', 'block', path, view.noticeVisible, view.id);
    if (requireOffline && view.offline !== 'YES') push('VIEW_OFFLINE_UNRESOLVED', 'block', path, view.offline, view.id);
    if (view.keyboard !== 'YES') push('VIEW_KEYBOARD_UNRESOLVED', 'block', path, view.keyboard, view.id);
    if (view.screenReader !== 'YES') push('VIEW_SCREEN_READER_UNRESOLVED', 'block', path, view.screenReader, view.id);
    if (view.targetPx === UNKNOWN) push('VIEW_TARGET_UNKNOWN', 'block', path, UNKNOWN, view.id);
    else if (view.targetPx < minTarget) push('VIEW_TARGET_TOO_SMALL', 'block', path, String(view.targetPx), view.id);
    if (view.publishedDate === UNKNOWN) push('VIEW_DATE_UNKNOWN', 'info', path, UNKNOWN, view.id);
  }
  if (requirePairs) {
    const byStem = new Map();
    for (const view of manifest.views) {
      const stem = view.path.replace(/(?:\/(?:en|fr)\/|[-_.](?:en|fr)(?=\.|$))/gu, '/');
      if (!byStem.has(stem)) byStem.set(stem, new Set());
      byStem.get(stem).add(view.locale);
    }
    for (const [stem, locales] of byStem) if (!locales.has('en') || !locales.has('fr')) push('LANGUAGE_PAIR_MISSING', 'block', `views.${stem}`, [...locales].join(','));
  }
  findings.sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code) || (a.sourceId ?? '').localeCompare(b.sourceId ?? ''));
  return {
    releaseId: manifest.releaseId, blocked: findings.some(f => f.level === 'block'),
    findings, blockingCount: findings.filter(f => f.level === 'block').length,
    informationCount: findings.filter(f => f.level === 'info').length,
    installBytes: unknownBytes ? UNKNOWN : total,
    budgetBytes: budget, matrix,
  };
}
