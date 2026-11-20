/** Fictional, local-only test observations; not claims about actual Ontario places. */
import { checksum } from './p15aa-contract.mjs';

export const copy = (value) => structuredClone(value);
export const source = (id = 'municipal', licence = 'OGL-ON-1.0', options = {}) => ({
  id, name: { en: `Fictional ${id} source`, fr: `Source fictive ${id}` },
  kind: licence === 'ODbL-1.0' ? 'open-map' : 'municipal',
  licence, observedOn: '2026-11-10', reference: `sources/${id}.json`,
  silo: licence === 'ODbL-1.0' ? 'odbl' : 'open', independenceGroup: id,
  ...options,
});
export const observation = (id, featureId, access = 'YES', sourceId = 'municipal', options = {}) => ({
  id, featureId, sourceId, access, observedOn: '2026-11-11', tier: 2,
  role: 'maintainer', note: 'Fictional survey observation', ...options,
});
export const feature = (id, observationIds = [], options = {}) => ({
  id, name: { en: `Fictional ${id} entrance`, fr: `Entrée fictive ${id}` },
  kind: 'entrance', access: observationIds.length ? 'YES' : 'UNKNOWN',
  tier: observationIds.length ? 2 : 1, silo: 'open', sourceIds: ['municipal'],
  observationIds, assetIds: [], ...options,
});
export const bytes = (value) => new TextEncoder().encode(value);
export const asset = (id, content = 'map', options = {}) => ({
  id, path: `offline/${id}.json`, sourceIds: ['municipal'], silo: 'open',
  bytes: bytes(content).length, sha256: checksum(bytes(content)),
  name: { en: `Fictional ${id} map`, fr: `Carte fictive ${id}` },
  ...options,
});
export function register() {
  return {
    version: 1, asOf: '2026-11-19', maxAgeDays: 60,
    sources: [source()],
    features: [feature('entrance-a', ['obs-a']), feature('entrance-b', ['obs-b'])],
    observations: [observation('obs-a', 'entrance-a'), observation('obs-b', 'entrance-b')],
    assets: [],
  };
}
export function withUnknown() {
  const result = register();
  result.features[1] = feature('entrance-b');
  result.observations = result.observations.filter((item) => item.featureId !== 'entrance-b');
  return result;
}
export function withNo() {
  const result = register();
  result.features[1].access = 'NO';
  result.observations[1].access = 'NO';
  return result;
}
export function withConflict() {
  const result = register();
  result.observations.push(observation('obs-c', 'entrance-b', 'NO'));
  result.features[1].observationIds.push('obs-c');
  result.features[1].access = 'UNKNOWN';
  result.features[1].tier = 1;
  return result;
}
export function withAsset(content = 'map') {
  const result = register();
  result.assets = [asset('map-a', content)];
  result.features[0].assetIds = ['map-a'];
  return result;
}
export function withIndependentSources() {
  const result = register();
  result.sources.push(source('provincial'));
  result.features[0].sourceIds.push('provincial');
  result.observations.push(observation('obs-d', 'entrance-a', 'YES', 'provincial', { tier: 3 }));
  result.features[0].observationIds.push('obs-d');
  result.features[0].tier = 3;
  return result;
}
export function withOdbl() {
  const result = register();
  result.sources.push(source('osm', 'ODbL-1.0'));
  result.features.push(feature('ramp-c', ['obs-c'], {
    name: { en: 'Fictional ramp', fr: 'Rampe fictive' },
    kind: 'ramp', silo: 'odbl', sourceIds: ['osm'],
  }));
  result.observations.push(observation('obs-c', 'ramp-c', 'YES', 'osm'));
  return result;
}
export function routeRequest(options = {}) {
  return {
    routeId: 'sample-route', featureIds: ['entrance-a', 'entrance-b'],
    silo: 'open', asOf: '2026-11-19', maximumAgeDays: 60,
    minimumTier: 2, allowUnknown: false, ...options,
  };
}
export function removalPolicy(options = {}) {
  return {
    removedSources: [], removedFeatures: [], removedObservations: [],
    removedAssets: [], maximumRemovals: 0, allowTierDecrease: false, ...options,
  };
}
export function reviewAuthorization(featureId, decision = 'accept', overrides = {}) {
  return {
    featureId, reviewer: 'maintainer', reviewedOn: '2026-11-19',
    decision, reason: 'Reviewed fictional observation package',
    sourceIds: ['municipal'], ...overrides,
  };
}
export function bytesMap(content = 'map') {
  return new Map([['offline/map-a.json', bytes(content)]]);
}
