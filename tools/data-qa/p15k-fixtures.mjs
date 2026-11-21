/** Fictional fixtures; no actual access assertion or operator feed. */
import { sha256 } from './p15k-core.mjs';

export const SOURCE = Object.freeze({
  source: 'Municipal fixture',
  licence: 'OGL-ON-1.0',
  observedOn: '2026-11-15',
  reference: 'sources/fixture.json',
});
export const REASON = Object.freeze({ en: 'Fictional record', fr: 'Fiche fictive' });
export const ZERO_HASH = '0'.repeat(64);
export const ONE_HASH = '1'.repeat(64);
export const TWO_HASH = '2'.repeat(64);

export function clone(value) { return structuredClone(value); }
export function source(patch = {}) { return { ...SOURCE, ...patch }; }
export function reason(patch = {}) { return { ...REASON, ...patch }; }
export function observation(patch = {}) {
  return {
    id: 'observation-one', placeId: 'place-one', feature: 'entrance',
    kind: 'OBSERVED', access: 'YES', recordedOn: '2026-11-15',
    source: source(), silo: 'open', reason: reason(), ...patch,
  };
}
export function decision(patch = {}) {
  return {
    placeId: 'place-one', feature: 'entrance', access: 'YES',
    observationIds: ['observation-one'], source: source(), silo: 'open', ...patch,
  };
}
export function history(patch = {}) {
  return {
    schemaVersion: 1, asOf: '2026-11-20', maxAgeDays: 30,
    observations: [observation()], decisions: [decision()],
    events: [
      { id: 'draft-one', state: 'DRAFT', at: '2026-11-15', sourceDigest: ZERO_HASH, reason: reason() },
      { id: 'ready-one', state: 'READY', at: '2026-11-16', sourceDigest: ZERO_HASH, reason: reason() },
      { id: 'published-one', state: 'PUBLISHED', at: '2026-11-17', sourceDigest: ZERO_HASH, reason: reason() },
    ], ...patch,
  };
}
export function asset(patch = {}) {
  return {
    id: 'asset-one', path: 'data/one.json', sha256: ONE_HASH,
    bytes: 100, source: source(), silo: 'open', kind: 'records', ...patch,
  };
}
export function fallback(before = [asset()], patch = {}) {
  const ordered = [...before].sort((a, b) => a.id.localeCompare(b.id));
  return {
    assetIds: before.map(item => item.id),
    manifestDigest: sha256(JSON.stringify(ordered)),
    reason: reason(), ...patch,
  };
}
export function refresh(patch = {}) {
  const before = [asset()];
  return {
    schemaVersion: 1, asOf: '2026-11-20', maxAgeDays: 30,
    maxTotalBytes: 100000, maxFileBytes: 10000,
    before, after: clone(before), operations: [], journal: [],
    fallback: fallback(before), ...patch,
  };
}
export function operation(patch = {}) {
  return {
    id: 'operation-one', kind: 'REPLACE', assetId: 'asset-one',
    previous: ONE_HASH, next: TWO_HASH, dependsOn: [], reason: reason(), ...patch,
  };
}
export function journal(operationId = 'operation-one', patch = {}) {
  return [
    { operationId, phase: 'PENDING', at: '2026-11-16', bytesOnDisk: 100, digest: ONE_HASH },
    { operationId, phase: 'DOWNLOADED', at: '2026-11-17', bytesOnDisk: 200, digest: TWO_HASH },
    { operationId, phase: 'CHECKED', at: '2026-11-18', bytesOnDisk: 200, digest: TWO_HASH },
    { operationId, phase: 'COMMITTED', at: '2026-11-19', bytesOnDisk: 200, digest: TWO_HASH },
  ].map(item => ({ ...item, ...patch }));
}
export function replacingRefresh(patch = {}) {
  const base = refresh();
  return {
    ...base, after: [asset({ sha256: TWO_HASH })], operations: [operation()],
    journal: journal(), ...patch,
  };
}
export function entry(patch = {}) {
  return {
    id: 'heading-one', kind: 'heading', en: 'Fictional page', fr: 'Page fictive',
    role: 'heading', minimumTargetPx: null, sourceId: null, ...patch,
  };
}
export function status(patch = {}) {
  return {
    id: 'status-one', kind: 'status', en: 'UNKNOWN', fr: 'UNKNOWN',
    role: 'status', minimumTargetPx: null, sourceId: null, status: 'UNKNOWN', ...patch,
  };
}
export function switchEntry(patch = {}) {
  return {
    id: 'language-one', kind: 'link', en: 'French version', fr: 'Version française',
    role: 'link', minimumTargetPx: 44, sourceId: null, href: 'fr/route.html', ...patch,
  };
}
export function page(patch = {}) {
  return {
    id: 'page-one', enPath: 'en/route.html', frPath: 'fr/route.html',
    headingKey: 'heading-one', statusKey: 'status-one', langSwitchKey: 'language-one',
    keyRefs: ['heading-one', 'status-one', 'language-one'], sourceIds: [], ...patch,
  };
}
export function control(patch = {}) {
  return {
    id: 'control-one', pageId: 'page-one', copyKey: 'language-one',
    type: 'link', widthPx: 44, heightPx: 44,
    labelledBy: 'language-one', focusIndex: 1, ...patch,
  };
}
export function disclosure(patch = {}) {
  return {
    id: 'disclosure-one', feature: 'entrance', access: 'UNKNOWN',
    sourceId: null, observedOn: null, enPageId: 'page-one', frPageId: 'page-one',
    evidenceIds: [], ...patch,
  };
}
export function catalogue(patch = {}) {
  return {
    schemaVersion: 1, asOf: '2026-11-20', maxAgeDays: 30,
    entries: [entry(), status(), switchEntry()], pages: [page()], sources: [],
    disclosures: [disclosure()], controls: [control()], evidence: [],
    offlineAssets: ['en/route.html', 'fr/route.html'], ...patch,
  };
}
export function sourceRecord(patch = {}) {
  return {
    id: 'source-one', stamp: source(), silo: 'open',
    attribution: { en: 'Municipal fictional record', fr: 'Fiche municipale fictive' }, ...patch,
  };
}
export function evidence(patch = {}) {
  return {
    id: 'evidence-one', feature: 'entrance', access: 'YES',
    sourceId: 'source-one', recordedOn: '2026-11-15', ...patch,
  };
}
export function knownCatalogue(patch = {}) {
  const base = catalogue();
  return {
    ...base, sources: [sourceRecord()],
    pages: [page({ sourceIds: ['source-one'] })],
    disclosures: [disclosure({ access: 'YES', sourceId: 'source-one', observedOn: '2026-11-15', evidenceIds: ['evidence-one'] })],
    evidence: [evidence()],
    offlineAssets: [...base.offlineAssets, 'sources/fixture.json'], ...patch,
  };
}
