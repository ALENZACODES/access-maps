/** Pure local export and evidence dependency closure, without any network side effect. */
import {
  accepted, blocked, checksum, diagnostic, isDate, isDigest, isId,
  isObject, isSafePath, isSilo, isUniqueIds, jsonBytes, stableDigest,
} from './p15aa-contract.mjs';
import { filterEvidenceRegister, parseEvidenceRegister } from './p15aa-intake.mjs';
import { assessRouteEvidence } from './p15aa-route-evidence.mjs';

const MAX_JSON_BYTES = 16 * 1024 * 1024;
const MAX_ASSET_BYTES = 32 * 1024 * 1024;
const SORT = (a, b) => a.localeCompare(b, 'en');
const byId = (rows) => new Map(rows.map((row) => [row.id, row]));

export function validateBytesByPath(register, bytesByPath) {
  const issues = [];
  if (!(bytesByPath instanceof Map) || bytesByPath.size > 20000) {
    return blocked([diagnostic('ASSET', '$.bytesByPath')]);
  }
  const expected = new Set(register.assets.map((asset) => asset.path));
  for (const path of bytesByPath.keys()) {
    if (!isSafePath(path) || !expected.has(path)) issues.push(diagnostic('REFERENCE', `bytes.${path}`));
  }
  const summaries = [];
  for (const asset of register.assets) {
    const bytes = bytesByPath.get(asset.path);
    if (!(bytes instanceof Uint8Array)) {
      issues.push(diagnostic('ASSET', `assets.${asset.id}.bytes`));
      continue;
    }
    if (bytes.byteLength > MAX_ASSET_BYTES || bytes.byteLength !== asset.bytes) {
      issues.push(diagnostic('ASSET', `assets.${asset.id}.bytes`));
      continue;
    }
    const digest = checksum(bytes);
    if (digest !== asset.sha256) issues.push(diagnostic('HASH', `assets.${asset.id}.sha256`));
    summaries.push(Object.freeze({
      id: asset.id,
      path: asset.path,
      bytes: bytes.byteLength,
      sha256: digest,
      silo: asset.silo,
      sourceIds: Object.freeze([...asset.sourceIds].sort(SORT)),
    }));
  }
  if (issues.length) return blocked(issues, { processed: summaries.length });
  return accepted(Object.freeze(summaries.sort((a, b) => SORT(a.id, b.id))), {
    processed: summaries.length,
    totalBytes: summaries.reduce((total, item) => total + item.bytes, 0),
  });
}

export function exportEvidenceSubset(input, selectedIds, bytesByPath) {
  const parsed = parseEvidenceRegister(input);
  if (!parsed.ok) return blocked(parsed.issues);
  const filtered = filterEvidenceRegister(parsed.value, selectedIds);
  if (!filtered.ok) return filtered;
  const integrity = validateBytesByPath(filtered.value, bytesByPath);
  if (!integrity.ok) return integrity;
  const document = Object.freeze({
    format: 'ontario-evidence-subset-v1',
    asOf: filtered.value.asOf,
    register: filtered.value,
    assets: integrity.value,
  });
  const bytes = jsonBytes(document);
  if (bytes.length > MAX_JSON_BYTES) return blocked([diagnostic('LIMIT', '$.export')]);
  return accepted(Object.freeze({
    document,
    bytes,
    sha256: checksum(bytes),
    totalBytes: bytes.length,
  }), { features: filtered.value.features.length, assets: integrity.value.length });
}

export function exportRouteEvidence(input, request, bytesByPath) {
  const parsed = parseEvidenceRegister(input);
  if (!parsed.ok) return blocked(parsed.issues);
  const assessed = assessRouteEvidence(parsed.value, request);
  if (!assessed.ok) return assessed;
  const subset = exportEvidenceSubset(parsed.value, request.featureIds, bytesByPath);
  if (!subset.ok) return subset;
  const report = Object.freeze({
    format: 'ontario-route-evidence-v1',
    routeId: request.routeId,
    assessment: assessed.value,
    subsetDigest: subset.value.sha256,
    sourceDigest: stableDigest(parsed.value.sources),
    asOf: request.asOf,
  });
  const bytes = jsonBytes(report);
  if (bytes.length > MAX_JSON_BYTES) return blocked([diagnostic('LIMIT', '$.routeExport')]);
  return accepted(Object.freeze({
    report,
    bytes,
    sha256: checksum(bytes),
  }), { sections: assessed.value.sections.length });
}

export function validateReceipt(receipt, expectedDigest, expectedBytes) {
  if (!isObject(receipt) || !isDigest(expectedDigest) ||
      !(expectedBytes instanceof Uint8Array) || expectedBytes.byteLength > MAX_JSON_BYTES) {
    return blocked([diagnostic('MANIFEST', '$.receipt')]);
  }
  if (!isDigest(receipt.sha256) || !Number.isSafeInteger(receipt.totalBytes) ||
      receipt.totalBytes !== expectedBytes.byteLength || receipt.sha256 !== expectedDigest) {
    return blocked([diagnostic('HASH', '$.receipt')]);
  }
  if (checksum(expectedBytes) !== receipt.sha256) return blocked([diagnostic('HASH', '$.receipt.sha256')]);
  return accepted(Object.freeze({ sha256: receipt.sha256, totalBytes: receipt.totalBytes }));
}

export function compareExportManifests(before, after) {
  if (!isObject(before) || !isObject(after) ||
      !Array.isArray(before.assets) || !Array.isArray(after.assets)) {
    return blocked([diagnostic('MANIFEST', '$.manifests')]);
  }
  const previous = byId(before.assets);
  const current = byId(after.assets);
  const changes = [];
  for (const id of [...new Set([...previous.keys(), ...current.keys()])].sort(SORT)) {
    const older = previous.get(id);
    const newer = current.get(id);
    const kind = !older ? 'added' : !newer ? 'removed' :
      stableDigest(older) === stableDigest(newer) ? 'unchanged' : 'changed';
    changes.push(Object.freeze({
      id, kind,
      beforeDigest: older?.sha256 ?? null,
      afterDigest: newer?.sha256 ?? null,
      beforeBytes: older?.bytes ?? null,
      afterBytes: newer?.bytes ?? null,
    }));
  }
  return accepted(Object.freeze(changes), {
    added: changes.filter((row) => row.kind === 'added').length,
    removed: changes.filter((row) => row.kind === 'removed').length,
    changed: changes.filter((row) => row.kind === 'changed').length,
  });
}

export function inventoryByLicence(register) {
  const sources = byId(register.sources);
  const groups = new Map();
  for (const feature of register.features) {
    const licences = [...new Set(feature.sourceIds.map((id) => sources.get(id)?.licence ?? 'UNKNOWN'))].sort(SORT);
    const key = `${feature.silo}|${licences.join(',')}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(feature.id);
  }
  return Object.freeze([...groups.entries()].sort(([a], [b]) => SORT(a, b))
    .map(([key, featureIds]) => Object.freeze({ group: key, featureIds: Object.freeze(featureIds.sort(SORT)) })));
}

export function listMissingDependencies(register, selectedIds) {
  if (!isUniqueIds(selectedIds)) return blocked([diagnostic('POLICY', '$.selectedIds')]);
  const features = byId(register.features);
  const sources = byId(register.sources);
  const observations = byId(register.observations);
  const assets = byId(register.assets);
  const missing = [];
  for (const id of selectedIds) {
    const feature = features.get(id);
    if (!feature) { missing.push(`feature:${id}`); continue; }
    for (const sourceId of feature.sourceIds) if (!sources.has(sourceId)) missing.push(`source:${sourceId}`);
    for (const observationId of feature.observationIds) {
      const observation = observations.get(observationId);
      if (!observation) missing.push(`observation:${observationId}`);
      else if (!sources.has(observation.sourceId)) missing.push(`source:${observation.sourceId}`);
    }
    for (const assetId of feature.assetIds) {
      const asset = assets.get(assetId);
      if (!asset) missing.push(`asset:${assetId}`);
      else for (const sourceId of asset.sourceIds) if (!sources.has(sourceId)) missing.push(`source:${sourceId}`);
    }
  }
  return accepted(Object.freeze([...new Set(missing)].sort(SORT)), { missing: missing.length });
}

export function localExportDescriptor(result, timestamp) {
  if (!result.ok || !isDate(timestamp)) return blocked([diagnostic('TIME', '$.timestamp')]);
  const digest = checksum(result.value.bytes);
  return accepted(Object.freeze({
    createdOn: timestamp,
    sha256: digest,
    bytes: result.value.bytes.length,
    storage: 'local-only',
    transmitted: false,
  }));
}
