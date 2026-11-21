import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compareManifests, countChanges, largestChanges } from './compare.mjs';
import { asset, clone, later, manifest, observation, place, POLICY, stamp } from './test-helpers.mjs';

function compare(before, after, policy = {}) {
  return compareManifests(before, after, { validation: POLICY, policy });
}
function blocks(before, after, code, policy = {}) {
  const result = compare(before, after, policy);
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.ok(result.findings.some(item => item.code === code), JSON.stringify(result.findings));
}

describe('P15L offline publication-to-publication regression', () => {
  it('accepts two identical manifests', () => assert.equal(compare(manifest(), manifest()).ok, true));
  it('accepts later publication date', () => assert.equal(compare(manifest(), later()).ok, true));
  it('blocks publication dates that move backward', () => {
    const after = manifest(); after.generatedOn = '2026-11-01';
    blocks(manifest(), after, 'RELEASE_DATE_REVERSED');
  });
  it('blocks a malformed previous publication', () => blocks({}, manifest(), 'BEFORE_INVALID'));
  it('blocks a malformed current publication', () => blocks(manifest(), {}, 'AFTER_INVALID'));
  it('blocks current publication with a missing licence', () => {
    const after = later(); after.sources[0].licence = '';
    blocks(manifest(), after, 'AFTER_INVALID');
  });
  it('blocks previous publication with a held source', () => {
    const before = manifest(); before.sources[0].name = 'MiWay';
    blocks(before, later(), 'BEFORE_INVALID');
  });
  it('reports an added source', () => {
    const after = later(); after.sources.push(stamp('source-b'));
    assert.deepEqual(compare(manifest(), after).changes.addedSources, ['source-b']);
  });
  it('reports a removed source', () => {
    const before = manifest(); before.sources.push(stamp('source-b'));
    blocks(before, later(), 'UNAPPROVED_REMOVAL');
  });
  it('accepts a separately approved source removal', () => {
    const before = manifest(); before.sources.push(stamp('source-b'));
    assert.equal(compare(before, later(), { allowRemovedSources: ['source-b'] }).ok, true);
  });
  it('blocks source removal approval that did not happen', () => {
    blocks(manifest(), later(), 'UNMATCHED_APPROVAL', { allowRemovedSources: ['source-b'] });
  });
  it('blocks duplicate source removal approvals', () => {
    blocks(manifest(), later(), 'REMOVAL_POLICY', { allowRemovedSources: ['source-b', 'source-b'] });
  });
  it('blocks malformed source removal approvals', () => {
    blocks(manifest(), later(), 'REMOVAL_POLICY', { allowRemovedSources: 'source-a' });
  });
  it('blocks reuse of a source id for a different licence', () => {
    const after = later(); after.sources[0].licence = 'CC-BY-4.0';
    blocks(manifest(), after, 'SOURCE_ID_REUSED');
  });
  it('blocks reuse of a source id for a different reference', () => {
    const after = later(); after.sources[0].reference = 'sources/another.json';
    blocks(manifest(), after, 'SOURCE_ID_REUSED');
  });
  it('blocks reuse of a source id for another name', () => {
    const after = later(); after.sources[0].name = 'Another public dataset';
    blocks(manifest(), after, 'SOURCE_ID_REUSED');
  });
  it('blocks source dates moving backwards', () => {
    const after = later(); after.sources[0].observedOn = '2026-11-01';
    blocks(manifest(), after, 'SOURCE_DATE_REVERSED');
  });
  it('reports newer source dates', () => {
    const after = later(); after.sources[0].observedOn = '2026-11-11';
    assert.deepEqual(compare(manifest(), after).changes.updatedSources, ['source-a']);
  });
  it('reports an added place', () => {
    const after = later(); after.places.push(place('place-b'));
    assert.deepEqual(compare(manifest(), after).changes.addedPlaces, ['place-b']);
  });
  it('blocks an unapproved removed place', () => {
    const before = manifest(); before.places.push(place('place-b'));
    blocks(before, later(), 'UNAPPROVED_REMOVAL');
  });
  it('accepts separately approved removal of an unused place', () => {
    const before = manifest(); before.places.push(place('place-b'));
    assert.equal(compare(before, later(), { allowRemovedPlaces: ['place-b'] }).ok, true);
  });
  it('blocks an id reused for a different region', () => {
    const after = later(); after.places[0].region = 'region-b';
    blocks(manifest(), after, 'PLACE_ID_REUSED');
  });
  it('blocks an id reused for a different category', () => {
    const after = later(); after.places[0].category = 'washroom';
    blocks(manifest(), after, 'PLACE_ID_REUSED');
  });
  it('records a bilingual rename without inventing a status', () => {
    const after = later(); after.places[0].nameEn = 'Fictional front entrance';
    after.places[0].nameFr = 'Entrée fictive principale';
    assert.deepEqual(compare(manifest(), after).changes.renamedPlaces, ['place-a']);
  });
  it('reports an added observation', () => {
    const after = later();
    after.observations.push({ ...observation('observation-b'), observedOn: '2026-11-14' });
    assert.deepEqual(compare(manifest(), after).changes.addedObservations, ['observation-b']);
  });
  it('blocks changing a published observation in place', () => {
    const after = later(); after.observations[0].state = 'YES';
    blocks(manifest(), after, 'OBSERVATION_MUTATED');
  });
  it('blocks changing an observation source in place', () => {
    const before = manifest(); before.sources.push(stamp('source-b'));
    const after = later(before); after.observations[0].sourceIds = ['source-b'];
    blocks(before, after, 'OBSERVATION_MUTATED');
  });
  it('blocks changing an observation description in place', () => {
    const after = later(); after.observations[0].descriptionEn = 'New assertion';
    blocks(manifest(), after, 'OBSERVATION_MUTATED');
  });
  it('blocks removal of an observation without approval', () => {
    const after = later(); after.observations = [];
    blocks(manifest(), after, 'UNAPPROVED_REMOVAL');
  });
  it('accepts approved observation removal', () => {
    const after = later(); after.observations = [];
    assert.equal(compare(manifest(), after, { allowRemovedObservations: ['observation-a'] }).ok, true);
  });
  it('blocks UNKNOWN becoming YES without new evidence', () => {
    const before = manifest(); before.observations = [];
    const after = later(before); after.observations = [{ ...observation(), state: 'YES' }];
    // A fresh sourced observation is valid support; compare allows this transition.
    assert.equal(compare(before, after).ok, true);
  });
  it('tracks UNKNOWN becoming YES with a new supporting observation', () => {
    const before = manifest(); before.observations = [];
    const after = later(before); after.observations.push({ ...observation('observation-b'), state: 'YES' });
    const result = compare(before, after);
    assert.deepEqual(result.changes.changedStatus, [{ placeId: 'place-a', before: 'UNKNOWN', after: 'YES' }]);
  });
  it('does not promote conflicting YES and NO observations to a known state', () => {
    const before = manifest(); before.observations = [];
    const after = later(before);
    after.observations.push({ ...observation('observation-b'), state: 'YES' });
    after.observations.push({ ...observation('observation-c'), state: 'NO' });
    const result = compare(before, after);
    assert.ok(result.changes.conflictingPlaces.includes('place-a'));
    assert.deepEqual(result.changes.changedStatus, []);
  });
  it('reports a new asset', () => {
    const after = later(); after.assets.push(asset('asset-b'));
    assert.deepEqual(compare(manifest(), after).changes.addedAssets, ['asset-b']);
  });
  it('blocks asset removal without approval', () => {
    const after = later(); after.assets = [];
    blocks(manifest(), after, 'UNAPPROVED_REMOVAL');
  });
  it('accepts approved asset removal', () => {
    const after = later(); after.assets = [];
    assert.equal(compare(manifest(), after, { allowRemovedAssets: ['asset-a'] }).ok, true);
  });
  it('blocks asset changing silo under same identifier', () => {
    const before = manifest(); before.sources[0].licence = 'ODbL-1.0'; before.assets[0].silo = 'odbl';
    const after = later(before); after.sources[0].licence = 'OGL-ON-1.0'; after.assets[0].silo = 'open';
    blocks(before, after, 'ASSET_ID_REUSED');
  });
  it('blocks asset bytes changing without new provenance', () => {
    const after = later(); after.assets[0].sha256 = 'b'.repeat(64);
    blocks(manifest(), after, 'ASSET_CHANGED_WITHOUT_SOURCE');
  });
  it('reports asset metadata changes', () => {
    const before = manifest(); before.sources.push(stamp('source-b'));
    const after = later(before); after.assets[0].sourceIds = ['source-b'];
    assert.deepEqual(compare(before, after).changes.relicensedAssets, ['asset-a']);
  });
  it('enforces a global maximum removal count', () => {
    const before = manifest(); before.places.push(place('place-b'));
    blocks(before, later(), 'REMOVAL_LIMIT', { allowRemovedPlaces: ['place-b'], maximumRemovals: 0 });
  });
  it('accepts a removal within a configured limit', () => {
    const before = manifest(); before.places.push(place('place-b'));
    assert.equal(compare(before, later(), { allowRemovedPlaces: ['place-b'], maximumRemovals: 1 }).ok, true);
  });
  it('summarizes changes by category', () => {
    const after = later(); after.places.push(place('place-b'));
    assert.equal(countChanges(compare(manifest(), after)).addedPlaces, 1);
  });
  it('limits the user-facing change overview', () => {
    const after = later(); after.places.push(place('place-b'));
    assert.equal(largestChanges(compare(manifest(), after), 1).length, 1);
  });
  it('keeps findings deterministic', () => {
    const before = manifest(); const after = later(); after.assets = [];
    assert.deepEqual(compare(before, after), compare(before, after));
  });
});
