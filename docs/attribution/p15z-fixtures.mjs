/** Fictional Ontario paths; explicitly not a live accessibility statement. */
export function source(id = 'city', licence = 'OGL-ON-1.0') {
  return { id, name: { en: 'Fictional municipal source', fr: 'Source municipale fictive' },
    licence, silo: licence === 'ODbL-1.0' ? 'odbl' : 'open',
    observedOn: '2026-11-10', reference: `sources/${id}.json` };
}
export function evidence(access = 'YES', sourceId = 'city', tier = 2) {
  return { sourceId, access, tier, observedOn: '2026-11-11' };
}
export function node(id, access = 'YES', overrides = {}) {
  return { id, name: { en: `Fictional ${id} point`, fr: `Point fictif ${id}` },
    access, tier: access === 'UNKNOWN' ? 1 : 2,
    sourceIds: ['city'], evidence: access === 'UNKNOWN' ? [] : [evidence(access)],
    silo: 'open', ...overrides };
}
export function link(id, from, to, metres = 100, overrides = {}) {
  const access = overrides.access ?? 'YES';
  return { id, from, to, metres, direction: 'both', kind: 'path', gradient: 2,
    name: { en: `Fictional ${id} path`, fr: `Chemin fictif ${id}` },
    access, tier: access === 'UNKNOWN' ? 1 : 2,
    sourceIds: ['city'], evidence: access === 'UNKNOWN' ? [] : [evidence(access)],
    silo: 'open', ...overrides };
}
export function event(id = 'event-one', segmentId = 'ab', kind = 'closure', overrides = {}) {
  const access = kind === 'closure' || kind === 'obstruction' ? 'NO' :
    kind === 'reopening' ? 'YES' : 'UNKNOWN';
  return { id, segmentId, kind, access, tier: access === 'UNKNOWN' ? 1 : 2,
    name: { en: `Fictional ${kind} notice`, fr: `Avis fictif de ${kind}` },
    startAt: '2026-11-19T10:00:00Z', endAt: '2026-11-19T12:00:00Z',
    sourceIds: ['city'], evidence: access === 'UNKNOWN' ? [] : [evidence(access)],
    silo: 'open', reference: `notices/${id}.json`, ...overrides };
}
export function network() {
  return { version: 1, asOf: '2026-11-19', maxAgeDays: 45, sources: [source()],
    nodes: [node('a'), node('b'), node('c'), node('d')],
    links: [link('ab', 'a', 'b', 100), link('bd', 'b', 'd', 100),
      link('ac', 'a', 'c', 140), link('cd', 'c', 'd', 140), link('bc', 'b', 'c', 80)] };
}
export function feed(events = [event()]) {
  return { version: 1, asOf: '2026-11-19', maxAgeDays: 45, sources: [source()], events };
}
export function request(overrides = {}) {
  return { start: 'a', end: 'd', when: '2026-11-19T11:00:00Z',
    silo: 'open', allowUnknown: true, maximumMetres: 1000, maximumHops: 5,
    maximumGradient: 8, alternatives: 3, avoidKinds: [], ...overrides };
}
export function copy(value) { return structuredClone(value); }
export function odblNetwork() {
  const result = network();
  result.sources.push(source('osm', 'ODbL-1.0'));
  result.nodes.push(node('e', 'YES', { silo: 'odbl', sourceIds: ['osm'], evidence: [evidence('YES', 'osm')] }));
  result.nodes.push(node('f', 'YES', { silo: 'odbl', sourceIds: ['osm'], evidence: [evidence('YES', 'osm')] }));
  result.links.push(link('ef', 'e', 'f', 30, { silo: 'odbl', sourceIds: ['osm'], evidence: [evidence('YES', 'osm')] }));
  return result;
}
export function odblFeed() {
  const result = feed([]);
  result.sources.push(source('osm', 'ODbL-1.0'));
  result.events.push(event('odbl-notice', 'ef', 'maintenance', { silo: 'odbl',
    sourceIds: ['osm'], evidence: [], access: 'UNKNOWN', tier: 1 }));
  return result;
}
