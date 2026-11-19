/** Synthetic Toronto-area fixtures. Coordinates are not a field survey. */
import { distance } from './p15w-geometry.mjs';

export const POSITIONS = Object.freeze({
  alpha: { lat: 43.7000, lon: -79.4000 },
  bravo: { lat: 43.7009, lon: -79.4000 },
  charlie: { lat: 43.7018, lon: -79.4000 },
  delta: { lat: 43.7009, lon: -79.4012 },
  echo: { lat: 43.7018, lon: -79.4012 },
});

export function sampleSource(id = 'city', licence = 'OGL-ON-1.0') {
  return { id, name: 'Municipal sample', licence, observedOn: '2026-11-10',
    reference: `sources/${id}.json`, en: 'Local data', fr: 'Données locales' };
}

export function observation(access = 'YES', feature = 'path', sourceId = 'city', tier = 2) {
  return { sourceId, observedOn: '2026-11-10', access, tier, feature };
}

export function sampleNode(id, access = 'YES', silo = 'open', sourceId = 'city') {
  const tier = access === 'UNKNOWN' ? 1 : 2;
  return { id, en: `${id} entrance`, fr: `Entrée ${id}`, coordinate: POSITIONS[id], feature: 'entrance',
    access, tier, sourceIds: [sourceId], evidence: access === 'UNKNOWN' ? [] :
      [observation(access, 'entrance', sourceId, tier)], silo };
}

export function sampleEdge(id, from, to, options = {}) {
  const sourceId = options.sourceId ?? 'city';
  const access = options.access ?? 'YES';
  const tier = access === 'UNKNOWN' ? 1 : 2;
  const a = POSITIONS[from];
  const b = POSITIONS[to];
  return { id, from, to, kind: options.kind ?? 'walk', en: `${from} to ${to}`,
    fr: `De ${from} à ${to}`, geometry: [a, b], lengthMetres: distance(a, b),
    access, tier, feature: 'path', sourceIds: [sourceId],
    evidence: access === 'UNKNOWN' ? [] : [observation(access, 'path', sourceId, tier)],
    silo: options.silo ?? 'open', bidirectional: options.bidirectional ?? true,
    gradientPercent: options.gradientPercent ?? 2 };
}

export function sampleAsset(id = 'map', silo = 'open', sourceId = 'city') {
  return { id, path: `tiles/${id}.bin`, bytes: 128, sha256: 'a'.repeat(64), sourceIds: [sourceId],
    silo, en: 'Offline map', fr: 'Carte hors ligne' };
}

export function sampleNetwork() {
  return { schemaVersion: 1, asOf: '2026-11-19', maxAgeDays: 90,
    sources: [sampleSource()],
    nodes: ['alpha', 'bravo', 'charlie', 'delta', 'echo'].map(id => sampleNode(id)),
    edges: [
      sampleEdge('ab', 'alpha', 'bravo'),
      sampleEdge('bc', 'bravo', 'charlie'),
      sampleEdge('ad', 'alpha', 'delta'),
      sampleEdge('de', 'delta', 'echo'),
      sampleEdge('ec', 'echo', 'charlie'),
      sampleEdge('bd', 'bravo', 'delta'),
    ],
    assets: [sampleAsset()],
  };
}

export function clone(value) {
  return structuredClone(value);
}

export function withNode(input, id, changes) {
  const result = clone(input);
  const index = result.nodes.findIndex(item => item.id === id);
  if (index < 0) return result;
  result.nodes[index] = { ...result.nodes[index], ...changes };
  return result;
}

export function withEdge(input, id, changes) {
  const result = clone(input);
  const index = result.edges.findIndex(item => item.id === id);
  if (index < 0) return result;
  result.edges[index] = { ...result.edges[index], ...changes };
  return result;
}
