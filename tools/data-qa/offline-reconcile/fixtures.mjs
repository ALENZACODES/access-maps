/** Reusable fictional inventory factories. No real address or personal data. */
import assert from 'node:assert/strict';
import { audit } from './audit.mjs';
import { compare } from './compare.mjs';
import { dayNumber, exact, id, safePath, safeText } from './contract.mjs';

export const source = Object.freeze({ id: 'municipal-a', name: 'Fictional municipal open data',
  licence: 'OGL-ON-1.0', observedOn: '2026-11-10', reference: 'sources/municipal-a.txt' });
export const observation = Object.freeze({ id: 'obs-a', placeId: 'place-a', feature: 'entrance',
  state: 'UNKNOWN', kind: 'OBSERVE', sourceIds: ['municipal-a'], observedOn: '2026-11-12',
  noteEn: 'No source conclusion for this entrance', noteFr: 'Aucune conclusion sur cette entrée' });
export const decision = Object.freeze({ placeId: 'place-a', feature: 'entrance', state: 'UNKNOWN',
  sourceIds: ['municipal-a'], observationIds: ['obs-a'], silo: 'open' });
export const policy = Object.freeze({ asOf: '2026-11-20', maxAgeDays: 30,
  maxSourceAgeDays: 30, maxObservations: 3000, maxSources: 1000 });
export function clone(value) { return structuredClone(value); }
export function base() {
  return { schemaVersion: 1, policy: clone(policy), sources: [clone(source)],
    observations: [clone(observation)], decisions: [clone(decision)] };
}
export function known(state = 'YES') {
  const input = base();
  input.observations[0].state = state;
  input.decisions[0].state = state;
  return input;
}
export function odbl() {
  const input = known('YES');
  input.sources[0].licence = 'ODbL-1.0';
  input.decisions[0].silo = 'odbl';
  return input;
}
export function secondFeature(input, feature = 'washroom', state = 'UNKNOWN') {
  input.observations.push({ ...clone(observation), id: `obs-${feature}`, feature, state });
  input.decisions.push({ ...clone(decision), feature, state, observationIds: [`obs-${feature}`] });
  return input;
}
export function secondSource(input, name = 'regional-b') {
  input.sources.push({ ...clone(source), id: name, name: 'Regional fictional open data',
    reference: `sources/${name}.txt` });
  return input;
}
export function corrected(input, state = 'NO') {
  const prior = input.observations[0];
  input.observations.push({ ...clone(prior), id: 'obs-b', kind: 'CORRECT',
    supersedes: prior.id, state, observedOn: '2026-11-15' });
  input.decisions[0].state = state;
  input.decisions[0].observationIds.push('obs-b');
  return input;
}
export function withdrawn(input) {
  const prior = input.observations[0];
  input.observations.push({ ...clone(prior), id: 'obs-withdraw', kind: 'WITHDRAW',
    supersedes: prior.id, state: 'UNKNOWN', observedOn: '2026-11-15' });
  input.decisions[0].state = 'UNKNOWN';
  input.decisions[0].observationIds.push('obs-withdraw');
  return input;
}
export function malformed(target, field, value) {
  const input = base();
  input[target][0][field] = value;
  return input;
}
export function issue(result, code) {
  return result.findings.some(item => item.code === code);
}
export function blocks(input, code) {
  const result = audit(input);
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.ok(issue(result, code), `Missing ${code}: ${JSON.stringify(result.findings)}`);
  return result;
}
export function allows(input) {
  const result = audit(input);
  assert.equal(result.ok, true, JSON.stringify(result.findings));
  return result;
}
export function blocksDelta(before, after, code, config) {
  const result = compare(before, after, config);
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.ok(issue(result, code), `Missing ${code}: ${JSON.stringify(result.findings)}`);
  return result;
}

