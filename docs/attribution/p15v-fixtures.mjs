/** Deterministic fictional Ontario route fixtures; no live-access claims. */
export function source(id = 'municipal', licence = 'OGL-ON-1.0') {
  return {
    id, name: { en: 'Fictional city source', fr: 'Source municipale fictive' },
    kind: 'municipal', licence, observedOn: '2026-11-01',
    reference: `sources/${id}.json`, silo: licence === 'ODbL-1.0' ? 'odbl' : 'open',
  };
}

export function evidence(feature, access = 'YES', sourceId = 'municipal', tier = 2) {
  return { feature, access, sourceId, observedOn: '2026-11-02', tier };
}

export function place(id, nodeIds, overrides = {}) {
  const access = overrides.access ?? 'YES';
  const feature = overrides.feature ?? 'entrance';
  return {
    id, name: { en: `Fictional ${id} site`, fr: `Lieu fictif ${id}` },
    feature, access, tier: access === 'UNKNOWN' ? 1 : 2,
    sourceIds: ['municipal'], evidence: access === 'UNKNOWN' ? [] : [evidence(feature, access)],
    silo: 'open', nodeIds,
    ...overrides,
  };
}

export function node(id, placeId, lat, lon, overrides = {}) {
  const access = overrides.access ?? 'YES';
  const feature = overrides.feature ?? 'path';
  return {
    id, name: { en: `Fictional ${id} junction`, fr: `Jonction fictive ${id}` },
    feature, access, tier: access === 'UNKNOWN' ? 1 : 2,
    sourceIds: ['municipal'], evidence: access === 'UNKNOWN' ? [] : [evidence(feature, access)],
    silo: 'open', placeId, lat, lon,
    ...overrides,
  };
}

export function edge(id, from, to, metres = 100, overrides = {}) {
  const access = overrides.access ?? 'YES';
  const feature = overrides.feature ?? 'path';
  return {
    id, name: { en: `Fictional ${id} segment`, fr: `Segment fictif ${id}` },
    feature, access, tier: access === 'UNKNOWN' ? 1 : 2,
    sourceIds: ['municipal'], evidence: access === 'UNKNOWN' ? [] : [evidence(feature, access)],
    silo: 'open', from, to, metres, direction: 'both',
    ...overrides,
  };
}

export function asset(id = 'routing-map') {
  return { id, path: `offline/${id}.json`, bytes: 20, sha256: 'a'.repeat(64),
    sourceIds: ['municipal'], silo: 'open' };
}

export function fictionalOntario() {
  return {
    version: 1, asOf: '2026-11-19', maxAgeDays: 45,
    sources: [source()],
    places: [place('library', ['a', 'b', 'c']), place('market', ['d'])],
    nodes: [
      node('a', 'library', 43.75, -79.44),
      node('b', 'library', 43.751, -79.441),
      node('c', 'library', 43.752, -79.442),
      node('d', 'market', 43.753, -79.443),
    ],
    edges: [
      edge('ab', 'a', 'b', 100),
      edge('bd', 'b', 'd', 120),
      edge('ac', 'a', 'c', 140),
      edge('cd', 'c', 'd', 150),
      edge('bc', 'b', 'c', 80),
    ],
    assets: [asset()],
  };
}

export function request(overrides = {}) {
  return {
    start: 'a', end: 'd', silo: 'open', allowUnknown: false,
    maximumMetres: 1000, maximumHops: 5, alternatives: 3,
    avoidFeatures: [], ...overrides,
  };
}

export function copy(value) {
  return structuredClone(value);
}

export function secondLicenceGroup(snapshot) {
  const next = copy(snapshot);
  next.sources.push(source('osm', 'ODbL-1.0'));
  const outside = place('park', ['e'], { silo: 'odbl', sourceIds: ['osm'],
    evidence: [evidence('entrance', 'YES', 'osm')] });
  next.places.push(outside);
  next.nodes.push(node('e', 'park', 43.754, -79.444, { silo: 'odbl', sourceIds: ['osm'],
    evidence: [evidence('path', 'YES', 'osm')] }));
  return next;
}
