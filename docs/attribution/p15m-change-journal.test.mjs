import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  auditChangeSnapshot,
  compareChangeSnapshots,
  changeJournalText,
} from './p15m-change-journal.mjs';

const source = { id: 'city', name: 'City open catalogue', licence: 'OGL-ON-1.0',
  reference: 'sources/city.json', observedOn: '2026-11-01' };
const extraSource = { id: 'county', name: 'County open catalogue', licence: 'CC-BY-4.0',
  reference: 'sources/county.json', observedOn: '2026-11-01' };
const observation = { sourceId: 'city', observedOn: '2026-11-02', access: 'YES' };
const extraObservation = { sourceId: 'county', observedOn: '2026-11-02', access: 'YES' };
const place = { id: 'civic-centre', en: 'Civic Centre', fr: 'Centre municipal',
  feature: 'entrance', access: 'YES', tier: 2, observedOn: '2026-11-03',
  sourceIds: ['city'], evidence: [observation], assetIds: ['entry-map'],
  silo: 'open', targetPx: 44 };
const asset = { id: 'entry-map', path: 'offline/entry.json', sha256: 'a'.repeat(64),
  bytes: 1024, sourceIds: ['city'], silo: 'open' };
const policy = () => ({ removedSources: [], removedRecords: [], removedAssets: [], maximumRemovals: 0 });
const make = (changes = {}) => ({ asOf: '2026-11-19', maxAgeDays: 90,
  sources: [source], records: [place], assets: [asset], ...changes });
const deep = item => structuredClone(item);
const errorCodes = value => auditChangeSnapshot(value).findings.map(item => item.code);
const compareCodes = (old, next, grant = policy()) => compareChangeSnapshots(old, next, grant).findings.map(item => item.code);
const replace = (record, changes) => ({ ...record, ...changes });

// Every test uses invented catalogue fixtures, never asserts live conditions.
describe('P15M isolated snapshot gate', () => {
  it('accepts a well-formed attributed candidate', () => {
    const result = auditChangeSnapshot(make());
    assert.equal(result.ok, true);
    assert.deepEqual(result.summary, { sources: 1, records: 1, assets: 1, unknown: 0, asserted: 1 });
  });
  it('is deterministic across repeated checks', () => {
    const candidate = make({ sources: [] });
    assert.deepEqual(auditChangeSnapshot(candidate), auditChangeSnapshot(candidate));
  });
  it('does not mutate caller data', () => {
    const candidate = make();
    const copy = deep(candidate);
    auditChangeSnapshot(candidate);
    assert.deepEqual(candidate, copy);
  });
  it('blocks absent candidates', () => assert.ok(errorCodes(null).includes('ROOT')));
  it('blocks array candidates', () => assert.ok(errorCodes([]).includes('ROOT')));
  it('blocks missing root members', () => {
    const value = make();
    delete value.assets;
    assert.ok(errorCodes(value).includes('ROOT'));
  });
  it('blocks extra root members', () => {
    assert.ok(errorCodes(make({ unseen: true })).includes('ROOT'));
  });
  it('blocks invalid root dates', () => {
    assert.ok(errorCodes(make({ asOf: '2026-02-30' })).includes('DATE'));
  });
  it('blocks dates with offsets', () => {
    assert.ok(errorCodes(make({ asOf: '2026-11-19T00:00:00Z' })).includes('DATE'));
  });
  it('accepts Gregorian leap day', () => {
    assert.equal(auditChangeSnapshot(make({ asOf: '2028-02-29', maxAgeDays: 3650 })).ok, true);
  });
  it('rejects invalid retention limits', () => {
    assert.ok(errorCodes(make({ maxAgeDays: -1 })).includes('DATE'));
    assert.ok(errorCodes(make({ maxAgeDays: 3651 })).includes('DATE'));
  });
  it('rejects overlarge collections before traversal', () => {
    assert.ok(errorCodes(make({ sources: Array(5001).fill(source) })).includes('LIMIT'));
  });
  it('requires source identifiers', () => {
    assert.ok(errorCodes(make({ sources: [replace(source, { id: 'City Name' })] })).includes('SOURCE'));
  });
  it('requires source titles', () => {
    assert.ok(errorCodes(make({ sources: [replace(source, { name: '' })] })).includes('SOURCE'));
  });
  it('does not accept unsupported licences', () => {
    assert.ok(errorCodes(make({ sources: [replace(source, { licence: 'proprietary' })] })).includes('LICENCE'));
  });
  it('requires local source references', () => {
    assert.ok(errorCodes(make({ sources: [replace(source, { reference: 'https://example.test' })] })).includes('REFERENCE'));
  });
  it('rejects parent-directory references', () => {
    assert.ok(errorCodes(make({ sources: [replace(source, { reference: '../city.json' })] })).includes('REFERENCE'));
  });
  it('rejects percent-encoded references', () => {
    assert.ok(errorCodes(make({ sources: [replace(source, { reference: '%2e%2e/city.json' })] })).includes('REFERENCE'));
  });
  it('rejects stale source dates', () => {
    assert.ok(errorCodes(make({ sources: [replace(source, { observedOn: '2025-01-01' })] })).includes('STALE'));
  });
  it('rejects future source dates', () => {
    assert.ok(errorCodes(make({ sources: [replace(source, { observedOn: '2026-11-20' })] })).includes('STALE'));
  });
  it('rejects duplicate sources', () => {
    assert.ok(errorCodes(make({ sources: [source, source] })).includes('DUPLICATE'));
  });
  it('rejects broken asset digests', () => {
    assert.ok(errorCodes(make({ assets: [replace(asset, { sha256: 'not-a-digest' })] })).includes('ASSET'));
  });
  it('rejects missing asset sources', () => {
    assert.ok(errorCodes(make({ assets: [replace(asset, { sourceIds: ['missing'] })] })).includes('CROSSREF'));
  });
  it('rejects duplicate asset paths', () => {
    const second = replace(asset, { id: 'second' });
    assert.ok(errorCodes(make({ assets: [asset, second] })).includes('DUPLICATE'));
  });
  it('rejects unbounded asset sizes', () => {
    assert.ok(errorCodes(make({ assets: [replace(asset, { bytes: 33 * 1024 * 1024 })] })).includes('ASSET'));
  });
  it('requires bilingual labels', () => {
    assert.ok(errorCodes(make({ records: [replace(place, { fr: '' })] })).includes('LABEL'));
  });
  it('rejects active code in user text', () => {
    assert.ok(errorCodes(make({ records: [replace(place, { en: '<script>bad</script>' })] })).includes('LABEL'));
  });
  it('enforces French nonbreaking colon space', () => {
    assert.ok(errorCodes(make({ records: [replace(place, { fr: 'Entrée : oui' })] })).includes('TYPOGRAPHY'));
  });
  it('allows French nonbreaking colon space', () => {
    assert.equal(auditChangeSnapshot(make({ records: [replace(place, { fr: 'Entrée\u00a0: oui' })] })).ok, true);
  });
  it('rejects invalid features', () => {
    assert.ok(errorCodes(make({ records: [replace(place, { feature: 'invented' })] })).includes('RECORD'));
  });
  it('rejects missing record source', () => {
    assert.ok(errorCodes(make({ records: [replace(place, { sourceIds: ['missing'] })] })).includes('PROVENANCE'));
  });
  it('requires existing offline asset references', () => {
    assert.ok(errorCodes(make({ records: [replace(place, { assetIds: ['ghost'] })] })).includes('LINK'));
  });
  it('rejects targets below 44 px', () => {
    assert.ok(errorCodes(make({ records: [replace(place, { targetPx: 43 })] })).includes('TARGET'));
  });
  it('rejects missing observations for asserted access', () => {
    assert.ok(errorCodes(make({ records: [replace(place, { evidence: [] })] })).includes('EVIDENCE'));
  });
  it('rejects observations from absent sources', () => {
    assert.ok(errorCodes(make({ records: [replace(place, { evidence: [replace(observation, { sourceId: 'other' })] })] })).includes('EVIDENCE'));
  });
  it('rejects observations predating source metadata', () => {
    assert.ok(errorCodes(make({ records: [replace(place, { evidence: [replace(observation, { observedOn: '2026-10-01' })] })] })).includes('STALE'));
  });
  it('rejects observations after record date', () => {
    assert.ok(errorCodes(make({ records: [replace(place, { evidence: [replace(observation, { observedOn: '2026-11-10' })] })] })).includes('STALE'));
  });
  it('rejects observation contradictions for asserted access', () => {
    const bad = replace(place, { evidence: [observation, replace(observation, { access: 'NO' })] });
    assert.ok(errorCodes(make({ records: [bad] })).includes('CONFLICT'));
  });
  it('accepts explicit UNKNOWN with conflicting observations', () => {
    const value = replace(place, { access: 'UNKNOWN', tier: 1,
      evidence: [observation, replace(observation, { access: 'NO' })] });
    assert.equal(auditChangeSnapshot(make({ records: [value] })).ok, true);
  });
  it('blocks tier zero with positive claims', () => {
    assert.ok(errorCodes(make({ records: [replace(place, { tier: 0 })] })).includes('TIER'));
  });
  it('permits tier zero without evidence or asserted access', () => {
    const value = replace(place, { tier: 0, access: 'UNKNOWN', evidence: [] });
    assert.equal(auditChangeSnapshot(make({ records: [value] })).ok, true);
  });
  it('blocks tier one with positive claims', () => {
    assert.ok(errorCodes(make({ records: [replace(place, { tier: 1 })] })).includes('TIER'));
  });
  it('requires two independent sources for tier three', () => {
    assert.ok(errorCodes(make({ records: [replace(place, { tier: 3 })] })).includes('TIER'));
  });
  it('allows two matching observations for tier three', () => {
    const value = replace(place, { tier: 3, sourceIds: ['city', 'county'], evidence: [observation, extraObservation] });
    const input = make({ sources: [source, extraSource], records: [value] });
    assert.equal(auditChangeSnapshot(input).ok, true);
  });
  it('keeps ODbL data in its own silo', () => {
    const odbl = replace(source, { licence: 'ODbL-1.0' });
    assert.ok(errorCodes(make({ sources: [odbl] })).includes('SILO'));
  });
  it('accepts an independently labelled ODbL export', () => {
    const odbl = replace(source, { licence: 'ODbL-1.0' });
    const output = make({ sources: [odbl], assets: [replace(asset, { silo: 'odbl' })],
      records: [replace(place, { silo: 'odbl' })] });
    assert.equal(auditChangeSnapshot(output).ok, true);
  });
  it('rejects an asset linked into a different silo', () => {
    const broken = replace(asset, { silo: 'odbl' });
    assert.ok(errorCodes(make({ assets: [broken] })).includes('SILO'));
  });
  it('diagnostics remain bilingual', () => {
    assert.ok(auditChangeSnapshot({}).findings.every(item => item.en.length > 0 && item.fr.length > 0));
  });
});

describe('P15M old-to-new change policy', () => {
  it('accepts two identical snapshots', () => {
    assert.equal(compareChangeSnapshots(make(), make(), policy()).ok, true);
  });
  it('returns deterministic summaries', () => {
    const previous = make();
    const next = make();
    assert.deepEqual(compareChangeSnapshots(previous, next, policy()).summary,
      { addedSources: 0, addedRecords: 0, addedAssets: 0, changedSources: 0,
        changedRecords: 0, changedAssets: 0, removedSources: 0,
        removedRecords: 0, removedAssets: 0, allowedRemovals: 0 });
  });
  it('does not mutate either snapshot', () => {
    const before = make();
    const after = make({ records: [] });
    const old = deep(before); const next = deep(after);
    compareChangeSnapshots(before, after, policy());
    assert.deepEqual(before, old); assert.deepEqual(after, next);
  });
  it('blocks invalid previous snapshots', () => {
    assert.ok(compareCodes({}, make()).includes('ROOT'));
  });
  it('blocks invalid new snapshots', () => {
    assert.ok(compareCodes(make(), {}).includes('ROOT'));
  });
  it('blocks missing removal policy', () => {
    assert.ok(compareChangeSnapshots(make(), make(), undefined).findings.some(item => item.code === 'POLICY'));
  });
  it('blocks unknown policy fields', () => {
    assert.ok(compareCodes(make(), make(), { ...policy(), bypass: true }).includes('POLICY'));
  });
  it('blocks duplicated policy identifiers', () => {
    assert.ok(compareCodes(make(), make(), { ...policy(), removedRecords: ['civic-centre', 'civic-centre'] }).includes('POLICY'));
  });
  it('blocks unapproved removed records', () => {
    assert.ok(compareCodes(make(), make({ records: [] })).includes('REMOVAL'));
  });
  it('allows explicitly named record removals', () => {
    const grant = { ...policy(), removedRecords: ['civic-centre'], maximumRemovals: 1 };
    assert.equal(compareChangeSnapshots(make(), make({ records: [] }), grant).ok, true);
  });
  it('blocks unused removal grants', () => {
    assert.ok(compareCodes(make(), make(), { ...policy(), removedRecords: ['civic-centre'] }).includes('UNUSED'));
  });
  it('blocks excessive approved removals', () => {
    const grant = { ...policy(), removedRecords: ['civic-centre'] };
    assert.ok(compareCodes(make(), make({ records: [] }), grant).includes('LIMIT'));
  });
  it('blocks missing asset without permission', () => {
    const next = make({ records: [replace(place, { assetIds: [] })], assets: [] });
    assert.ok(compareCodes(make(), next).includes('REMOVAL'));
  });
  it('allows explicitly named removed assets', () => {
    const next = make({ records: [replace(place, { assetIds: [] })], assets: [] });
    const grant = { ...policy(), removedAssets: ['entry-map'], maximumRemovals: 1 };
    assert.equal(compareChangeSnapshots(make(), next, grant).ok, true);
  });
  it('blocks source identifier reuse after licence change', () => {
    const next = make({ sources: [replace(source, { licence: 'CC0-1.0' })] });
    assert.ok(compareCodes(make(), next).includes('REUSE'));
  });
  it('blocks source identifier reuse after title change', () => {
    const next = make({ sources: [replace(source, { name: 'New title' })] });
    assert.ok(compareCodes(make(), next).includes('REUSE'));
  });
  it('blocks source identifier reuse after reference change', () => {
    const next = make({ sources: [replace(source, { reference: 'sources/new.json' })] });
    assert.ok(compareCodes(make(), next).includes('REUSE'));
  });
  it('blocks a source observation date regression', () => {
    const next = make({ sources: [replace(source, { observedOn: '2026-10-30' })],
      records: [replace(place, { evidence: [replace(observation, { observedOn: '2026-11-02' })] })] });
    assert.ok(compareCodes(make(), next).includes('CLOCK'));
  });
  it('allows a later source observation date with consistent evidence', () => {
    const next = make({ sources: [replace(source, { observedOn: '2026-11-02' })] });
    assert.equal(compareChangeSnapshots(make(), next, policy()).ok, true);
  });
  it('blocks old-to-new catalogue date regression', () => {
    assert.ok(compareCodes(make(), make({ asOf: '2026-11-18' })).includes('CLOCK'));
  });
  it('allows a later catalogue date', () => {
    assert.equal(compareChangeSnapshots(make(), make({ asOf: '2026-11-20' }), policy()).ok, true);
  });
  it('blocks an observation chain being truncated', () => {
    const previous = make({ sources: [source, extraSource], records: [replace(place,
      { sourceIds: ['city', 'county'], evidence: [observation, extraObservation] })] });
    assert.ok(compareCodes(previous, make()).includes('LOSS'));
  });
  it('allows appending a new observation', () => {
    const candidate = make({ records: [replace(place,
      { observedOn: '2026-11-05', evidence: [observation, replace(observation, { observedOn: '2026-11-04' })] })] });
    assert.equal(compareChangeSnapshots(make(), candidate, policy()).ok, true);
  });
  it('requires new evidence to change an access claim', () => {
    const before = make({ records: [replace(place, { access: 'UNKNOWN', tier: 1 })] });
    assert.ok(compareCodes(before, make()).includes('DOWNGRADE'));
  });
  it('allows new evidence to support a changed access claim', () => {
    const before = make({ records: [replace(place,
      { access: 'UNKNOWN', tier: 1, evidence: [] })] });
    assert.equal(compareChangeSnapshots(before, make(), policy()).ok, true);
  });
  it('does not permit tier escalation without new evidence', () => {
    const before = make({ records: [replace(place, { tier: 1, access: 'UNKNOWN' })] });
    assert.ok(compareCodes(before, make()).includes('TIER'));
  });
  it('blocks an accessibility target shrinking', () => {
    const before = make({ records: [replace(place, { targetPx: 48 })] });
    assert.ok(compareCodes(before, make()).includes('TARGET'));
  });
  it('allows a target increasing', () => {
    const next = make({ records: [replace(place, { targetPx: 48 })] });
    assert.equal(compareChangeSnapshots(make(), next, policy()).ok, true);
  });
  it('blocks an asset digest changing under the same identifier', () => {
    const next = make({ assets: [replace(asset, { sha256: 'b'.repeat(64) })] });
    assert.ok(compareCodes(make(), next).includes('BYTES'));
  });
  it('blocks an asset path changing under the same identifier', () => {
    const next = make({ assets: [replace(asset, { path: 'offline/next.json' })] });
    assert.ok(compareCodes(make(), next).includes('BYTES'));
  });
  it('blocks an asset byte count changing under the same identifier', () => {
    const next = make({ assets: [replace(asset, { bytes: 1000 })] });
    assert.ok(compareCodes(make(), next).includes('BYTES'));
  });
  it('permits new immutable asset identifiers', () => {
    const added = replace(asset, { id: 'new-map', path: 'offline/new.json' });
    const next = make({ assets: [asset, added] });
    assert.equal(compareChangeSnapshots(make(), next, policy()).ok, true);
  });
  it('counts added records without granting a removal', () => {
    const newRecord = replace(place, { id: 'new-centre' });
    const next = make({ records: [place, newRecord] });
    assert.equal(compareChangeSnapshots(make(), next, policy()).summary.addedRecords, 1);
  });
  it('blocks incompatible record feature reuse', () => {
    const next = make({ records: [replace(place, { feature: 'path' })] });
    assert.ok(compareCodes(make(), next).includes('REUSE'));
  });
  it('keeps output bilingual', () => {
    const result = compareChangeSnapshots(make(), make({ records: [] }), policy());
    assert.match(changeJournalText(result, 'en'), /Change blocked/);
    assert.match(changeJournalText(result, 'fr'), /Modification bloquée/);
    assert.ok(result.findings.every(item => item.en && item.fr));
  });
  it('rejects unsupported locale values', () => {
    assert.throws(() => changeJournalText({ ok: true, findings: [] }, 'de'), RangeError);
  });
  it('does not depend on input member order', () => {
    const original = make(); const reOrdered = make({ records: [
      { targetPx: place.targetPx, silo: place.silo, assetIds: place.assetIds, evidence: place.evidence,
        sourceIds: place.sourceIds, observedOn: place.observedOn, tier: place.tier,
        access: place.access, feature: place.feature, fr: place.fr, en: place.en, id: place.id },
    ] });
    assert.equal(compareChangeSnapshots(original, reOrdered, policy()).ok, true);
  });
});
