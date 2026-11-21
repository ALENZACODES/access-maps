/** Fictional test-only fixtures. No external data or network access. */
export const HASH_A = 'a'.repeat(64);
export const HASH_B = 'b'.repeat(64);
export const HASH_C = 'c'.repeat(64);
export const AS_OF = '2026-11-20';
export const POLICY = { asOf: AS_OF, maxAgeDays: 365 };

export function stamp(id = 'source-a') {
  return { id, name: 'Municipal open information', licence: 'OGL-ON-1.0',
    observedOn: '2026-11-10', reference: `sources/${id}.json` };
}

export function place(id = 'place-a') {
  return { id, nameEn: 'Fictional entrance', nameFr: 'Entrée fictive',
    region: 'region-a', category: 'entrance' };
}

export function observation(id = 'observation-a') {
  return { id, placeId: 'place-a', state: 'UNKNOWN',
    sourceIds: ['source-a'], observedOn: '2026-11-12',
    descriptionEn: 'No access record supplied',
    descriptionFr: 'Aucune donnée d’accès fournie' };
}

export function asset(id = 'asset-a') {
  return { id, path: `offline/${id}.json`, sha256: HASH_A,
    bytes: 128, sourceIds: ['source-a'], silo: 'open', kind: 'json' };
}

export function manifest() {
  return {
    schemaVersion: 1, generatedOn: '2026-11-15',
    sources: [stamp()], places: [place()], observations: [observation()], assets: [asset()],
  };
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function withSource(key, value) {
  const input = manifest();
  input.sources[0][key] = value;
  return input;
}

export function withPlace(key, value) {
  const input = manifest();
  input.places[0][key] = value;
  return input;
}

export function withObservation(key, value) {
  const input = manifest();
  input.observations[0][key] = value;
  return input;
}

export function withAsset(key, value) {
  const input = manifest();
  input.assets[0][key] = value;
  return input;
}

export function later(input = manifest()) {
  const updated = clone(input);
  updated.generatedOn = '2026-11-19';
  return updated;
}
