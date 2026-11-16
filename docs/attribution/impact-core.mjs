/** Deterministic comparison of two explicit release packages. No network or storage. */
import { UNKNOWN, isKnownDate } from './provenance-core.mjs';
import { parseReleasePackage, parseReleasePackageText } from './disclosure-core.mjs';

export const IMPACT_SCHEMA = 1;
export const IMPACT_MAX_BYTES = 4_194_304;
export const IMPACT_FIELDS = Object.freeze(['id', 'scope', 'kind', 'field', 'before', 'after', 'surfaceIds']);
export const IMPACT_SCOPES = Object.freeze(['dataset', 'surface', 'link']);
export const IMPACT_KINDS = Object.freeze(['added', 'removed', 'changed', 'linked', 'unlinked']);
export const DATASET_FIELDS = Object.freeze([
  'title', 'provider', 'use', 'status', 'sourceName', 'sourceUrl', 'licence',
  'licenceUrl', 'acquiredOn', 'datasetAsOf', 'termsReviewedOn', 'notice',
  'containsOdbl', 'derivedFromOdbl', 'redistributionAllowed', 'notes',
]);
export const SURFACE_FIELDS = Object.freeze([
  'titleEn', 'titleFr', 'kind', 'state', 'path', 'delivery', 'lastReviewedOn',
  'sourceDate', 'creditEn', 'creditFr', 'noticeEn', 'noticeFr', 'supportsKeyboard',
  'supportsScreenReader', 'minimumTargetPx', 'notesEn', 'notesFr',
]);

export class ImpactError extends Error {
  constructor(code, location) {
    super(`${code}: ${location}`);
    this.name = 'ImpactError';
    this.code = code;
    this.location = location;
  }
}

function fail(code, location) {
  throw new ImpactError(code, location);
}

export function parseImpactPackageText(text) {
  if (typeof text !== 'string') fail('INVALID_FILE', 'file');
  if (new TextEncoder().encode(text).byteLength > IMPACT_MAX_BYTES) {
    fail('FILE_TOO_LARGE', 'file');
  }
  return parseReleasePackageText(text);
}

export function normalizeDate(value) {
  if (value !== UNKNOWN && !isKnownDate(value)) fail('INVALID_DATE', 'referenceDate');
  return value;
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sameValue(left, right) {
  return stableJson(left) === stableJson(right);
}

export function sourceUsage(bundle) {
  const current = parseReleasePackage(bundle);
  const usage = new Map();
  for (const record of current.inventory.records) usage.set(record.id, new Set());
  for (const surface of current.register.surfaces) {
    for (const sourceId of surface.sourceIds) {
      if (!usage.has(sourceId)) usage.set(sourceId, new Set());
      usage.get(sourceId).add(surface.id);
    }
  }
  return usage;
}

function sortedIds(records) {
  return new Map(records.map((record) => [record.id, record]));
}

function publicValue(value) {
  return value === undefined ? null : value;
}

function item(scope, id, kind, field, before, after, surfaceIds = []) {
  return Object.freeze({
    id, scope, kind, field,
    before: publicValue(before), after: publicValue(after),
    surfaceIds: Object.freeze([...new Set(surfaceIds)].sort()),
  });
}

function compareRecords(scope, before, after, fields, result, usages) {
  const left = sortedIds(before);
  const right = sortedIds(after);
  const ids = [...new Set([...left.keys(), ...right.keys()])].sort();
  for (const id of ids) {
    const previous = left.get(id);
    const candidate = right.get(id);
    const related = scope === 'dataset'
      ? [...new Set([...(usages.before.get(id) ?? []), ...(usages.after.get(id) ?? [])])]
      : [id];
    if (!previous) {
      result.push(item(scope, id, 'added', null, null, candidate, related));
      continue;
    }
    if (!candidate) {
      result.push(item(scope, id, 'removed', null, previous, null, related));
      continue;
    }
    for (const field of fields) {
      if (!sameValue(previous[field], candidate[field])) {
        result.push(item(scope, id, 'changed', field, previous[field], candidate[field], related));
      }
    }
  }
}

function compareLinks(previous, candidate, changes) {
  const oldSurfaces = sortedIds(previous.register.surfaces);
  const newSurfaces = sortedIds(candidate.register.surfaces);
  for (const id of [...new Set([...oldSurfaces.keys(), ...newSurfaces.keys()])].sort()) {
    const left = new Set(oldSurfaces.get(id)?.sourceIds ?? []);
    const right = new Set(newSurfaces.get(id)?.sourceIds ?? []);
    for (const sourceId of [...new Set([...left, ...right])].sort()) {
      if (left.has(sourceId) === right.has(sourceId)) continue;
      changes.push(item('link', `${id}/${sourceId}`, right.has(sourceId) ? 'linked' : 'unlinked',
        'sourceIds', left.has(sourceId), right.has(sourceId), [id]));
    }
  }
}

/** Returns complete field-level differences, including removals and attribution edits. */
export function compareReleasePackages(previousInput, candidateInput) {
  const previous = parseReleasePackage(previousInput);
  const candidate = parseReleasePackage(candidateInput);
  const usages = { before: sourceUsage(previous), after: sourceUsage(candidate) };
  const changes = [];
  compareRecords('dataset', previous.inventory.records, candidate.inventory.records,
    DATASET_FIELDS, changes, usages);
  compareRecords('surface', previous.register.surfaces, candidate.register.surfaces,
    SURFACE_FIELDS, changes, usages);
  compareLinks(previous, candidate, changes);
  const counts = {
    total: changes.length,
    added: changes.filter((change) => change.kind === 'added').length,
    removed: changes.filter((change) => change.kind === 'removed').length,
    changed: changes.filter((change) => change.kind === 'changed').length,
    linked: changes.filter((change) => change.kind === 'linked').length,
    unlinked: changes.filter((change) => change.kind === 'unlinked').length,
  };
  return Object.freeze({
    version: IMPACT_SCHEMA,
    previous, candidate,
    changes: Object.freeze(changes),
    counts: Object.freeze(counts),
  });
}

export function changedRecords(comparison, scope) {
  if (!IMPACT_SCOPES.includes(scope)) fail('INVALID_SCOPE', 'scope');
  return [...new Set(comparison.changes.filter((change) => change.scope === scope)
    .map((change) => change.id))].sort();
}

export function filterImpactChanges(comparison, options = {}) {
  const { scope = 'all', kind = 'all', query = '' } = options;
  if (scope !== 'all' && !IMPACT_SCOPES.includes(scope)) fail('INVALID_SCOPE', 'filter.scope');
  if (kind !== 'all' && !IMPACT_KINDS.includes(kind)) fail('INVALID_KIND', 'filter.kind');
  if (typeof query !== 'string' || query.length > 250) fail('INVALID_QUERY', 'filter.query');
  const needle = query.trim().toLocaleLowerCase('en');
  return comparison.changes.filter((change) =>
    (scope === 'all' || change.scope === scope) &&
    (kind === 'all' || change.kind === kind) &&
    (!needle || [change.id, change.field ?? '', ...change.surfaceIds]
      .join(' ').toLocaleLowerCase('en').includes(needle)));
}

export function impactSummary(comparison) {
  const changedDatasets = changedRecords(comparison, 'dataset');
  const changedSurfaces = changedRecords(comparison, 'surface');
  const affectedSurfaces = [...new Set(comparison.changes
    .flatMap((change) => change.surfaceIds))].sort();
  return Object.freeze({
    ...comparison.counts,
    changedDatasets: Object.freeze(changedDatasets),
    changedSurfaces: Object.freeze(changedSurfaces),
    affectedSurfaces: Object.freeze(affectedSurfaces),
    unchanged: comparison.changes.length === 0,
  });
}

export function buildComparisonText(previousText, candidateText) {
  return compareReleasePackages(parseImpactPackageText(previousText),
    parseImpactPackageText(candidateText));
}

/** Keep exports deterministic for reproducible local release artifacts. */
export function impactChangesJson(comparison) {
  return `${JSON.stringify({ version: IMPACT_SCHEMA,
    counts: comparison.counts, changes: comparison.changes }, null, 2)}\n`;
}

export function impactsForSurface(comparison, surfaceId) {
  if (typeof surfaceId !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/u.test(surfaceId)) {
    fail('INVALID_ID', 'surfaceId');
  }
  return comparison.changes.filter((change) => change.surfaceIds.includes(surfaceId));
}

export function sourceDependencyTable(bundle) {
  const usage = sourceUsage(bundle);
  return Object.freeze([...usage.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([sourceId, surfaces]) => Object.freeze({
      sourceId, surfaceIds: Object.freeze([...surfaces].sort()),
      count: surfaces.size,
    })));
}

export function compareDependencyTables(previous, candidate) {
  const before = new Map(sourceDependencyTable(previous).map((entry) => [entry.sourceId, entry]));
  const after = new Map(sourceDependencyTable(candidate).map((entry) => [entry.sourceId, entry]));
  return Object.freeze([...new Set([...before.keys(), ...after.keys()])].sort()
    .map((sourceId) => Object.freeze({
      sourceId,
      before: before.get(sourceId)?.surfaceIds ?? Object.freeze([]),
      after: after.get(sourceId)?.surfaceIds ?? Object.freeze([]),
    })));
}
