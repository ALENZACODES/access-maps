import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { auditOfflineEvidence, offlineEvidenceText, OFFLINE_EVIDENCE_LIMITS } from './p15l-offline-evidence.mjs';

const bytes = new TextEncoder().encode('{"place":"library"}');
const digest = createHash('sha256').update(bytes).digest('hex');
const source = { id: 'municipal', name: 'Municipal open data', licence: 'OGL-ON-1.0',
  observedOn: '2026-11-10', reference: 'sources/municipal.json' };
const observation = { feature: 'entrance', access: 'YES', sourceId: 'municipal',
  observedOn: '2026-11-11', tier: 2 };
const record = { id: 'library', en: 'Library entrance', fr: 'Entrée de bibliothèque',
  feature: 'entrance', access: 'YES', tier: 2, sourceIds: ['municipal'],
  fileIds: ['metadata'], silo: 'open', observations: [observation] };
const file = { id: 'metadata', path: 'offline/library.json', sha256: digest,
  bytes: bytes.byteLength, sourceIds: ['municipal'], silo: 'open' };
function pack(changes = {}) {
  return { schemaVersion: 1, asOf: '2026-11-16', maxAgeDays: 30,
    sources: [source], records: [record], files: [file], ...changes };
}
function check(value = pack(), attached = { 'offline/library.json': bytes }) {
  return auditOfflineEvidence(value, attached);
}
function codes(value = pack(), attached = { 'offline/library.json': bytes }) {
  return check(value, attached).findings.map(item => item.code);
}
function changedRecord(changes) { return { ...record, ...changes }; }
function changedSource(changes) { return { ...source, ...changes }; }
function changedFile(changes) { return { ...file, ...changes }; }

describe('P15L offline evidence publication safety', () => {
  it('accepts a complete bilingual package with local bytes', () => {
    assert.equal(check().ok, true);
  });
  it('preserves exact summary counts', () => {
    assert.deepEqual(check().summary, { sources: 1, records: 1, files: 1,
      unknown: 0, asserted: 1, tier0: 0, totalBytes: bytes.byteLength });
  });
  it('reproduces the same report on repeat', () => {
    assert.deepEqual(check(), check());
  });
  it('does not copy untrusted values into diagnostics', () => {
    const result = check(pack({ records: [changedRecord({ en: '<script>bad</script>' })] }));
    assert.ok(result.findings.every(issue => !JSON.stringify(issue).includes('<script>')));
  });
  it('provides readable English and French output', () => {
    const result = check(pack({ records: [] }));
    assert.match(offlineEvidenceText(result, 'en'), /Check passed/);
    assert.match(offlineEvidenceText(result, 'fr'), /Contrôle réussi/);
  });
  it('blocks a failing package in both languages', () => {
    const result = check(null);
    assert.match(offlineEvidenceText(result, 'en'), /Export blocked/);
    assert.match(offlineEvidenceText(result, 'fr'), /Exportation bloquée/);
  });
  it('rejects unsupported locale formatting', () => {
    assert.throws(() => offlineEvidenceText(check(), 'es'), TypeError);
  });
  it('rejects a null package', () => { assert.ok(codes(null).includes('ROOT')); });
  it('rejects arrays as package roots', () => { assert.ok(codes([]).includes('ROOT')); });
  it('rejects additional root fields', () => { assert.ok(codes(pack({ extra: 1 })).includes('ROOT')); });
  it('rejects unsupported schema versions', () => { assert.ok(codes(pack({ schemaVersion: 2 })).includes('ROOT')); });
  it('requires all three data arrays', () => { assert.ok(codes(pack({ files: null })).includes('ROOT')); });
  it('rejects invalid calendar dates', () => { assert.ok(codes(pack({ asOf: '2026-02-30' })).includes('DATE')); });
  it('rejects negative max ages', () => { assert.ok(codes(pack({ maxAgeDays: -1 })).includes('DATE')); });
  it('rejects excessive max ages', () => { assert.ok(codes(pack({ maxAgeDays: 4000 })).includes('DATE')); });
  it('rejects too many records without expensive processing', () => {
    assert.ok(codes(pack({ records: Array(OFFLINE_EVIDENCE_LIMITS.records + 1).fill(record) })).includes('LIMIT'));
  });
  it('rejects too many source entries', () => {
    assert.ok(codes(pack({ sources: Array(OFFLINE_EVIDENCE_LIMITS.sources + 1).fill(source) })).includes('LIMIT'));
  });
  it('rejects too many file entries', () => {
    assert.ok(codes(pack({ files: Array(OFFLINE_EVIDENCE_LIMITS.files + 1).fill(file) })).includes('LIMIT'));
  });
  it('requires source ids', () => { assert.ok(codes(pack({ sources: [changedSource({ id: '' })] })).includes('SOURCE')); });
  it('requires safe source reference paths', () => {
    assert.ok(codes(pack({ sources: [changedSource({ reference: '../private.json' })] })).includes('SOURCE'));
  });
  it('requires supported source licences', () => {
    assert.ok(codes(pack({ sources: [changedSource({ licence: 'private' })] })).includes('LICENCE'));
  });
  it('rejects duplicate sources', () => {
    assert.ok(codes(pack({ sources: [source, source] })).includes('DUPLICATE'));
  });
  it('rejects source dates in the future', () => {
    assert.ok(codes(pack({ sources: [changedSource({ observedOn: '2026-11-20' })] })).includes('AGE'));
  });
  it('rejects stale source dates', () => {
    assert.ok(codes(pack({ sources: [changedSource({ observedOn: '2026-01-01' })] })).includes('AGE'));
  });
  it('requires local file paths', () => {
    assert.ok(codes(pack({ files: [changedFile({ path: '/etc/data.json' })] })).includes('FILE'));
  });
  it('rejects traversal in file paths', () => {
    assert.ok(codes(pack({ files: [changedFile({ path: 'offline/../x.json' })] })).includes('FILE'));
  });
  it('rejects duplicate file paths', () => {
    assert.ok(codes(pack({ files: [file, changedFile({ id: 'second' })] })).includes('DUPLICATE'));
  });
  it('rejects duplicate file identifiers', () => {
    assert.ok(codes(pack({ files: [file, file] })).includes('DUPLICATE'));
  });
  it('rejects missing file bytes', () => { assert.ok(codes(pack(), {}).includes('BYTES')); });
  it('rejects changed file length', () => {
    assert.ok(codes(pack(), { 'offline/library.json': new Uint8Array([1]) }).includes('BYTES'));
  });
  it('rejects changed content even with the same byte length', () => {
    const altered = new Uint8Array(bytes); altered[1] ^= 1;
    assert.ok(codes(pack(), { 'offline/library.json': altered }).includes('DIGEST'));
  });
  it('rejects invalid digest formats', () => {
    assert.ok(codes(pack({ files: [changedFile({ sha256: 'wrong' })] })).includes('FILE'));
  });
  it('rejects extra files not listed by the manifest', () => {
    assert.ok(codes(pack(), { 'offline/library.json': bytes, 'offline/extra.json': bytes }).includes('REFERENCE'));
  });
  it('allows no assets when the record has no file references', () => {
    assert.equal(codes(pack({ files: [], records: [changedRecord({ fileIds: [] })] }), {}).length, 0);
  });
  it('rejects unknown asset references from records', () => {
    assert.ok(codes(pack({ records: [changedRecord({ fileIds: ['absent'] })] })).includes('FILE_LINK'));
  });
  it('rejects unknown source references from records', () => {
    assert.ok(codes(pack({ records: [changedRecord({ sourceIds: ['absent'] })] })).includes('SOURCE_LINK'));
  });
  it('rejects unknown source references from files', () => {
    assert.ok(codes(pack({ files: [changedFile({ sourceIds: ['absent'] })] })).includes('SOURCE_LINK'));
  });
  it('rejects duplicate record ids', () => {
    assert.ok(codes(pack({ records: [record, record] })).includes('DUPLICATE'));
  });
  it('rejects missing English labels', () => {
    assert.ok(codes(pack({ records: [changedRecord({ en: '' })] })).includes('LABEL'));
  });
  it('rejects missing French labels', () => {
    assert.ok(codes(pack({ records: [changedRecord({ fr: '' })] })).includes('LABEL'));
  });
  it('rejects unsafe markup in labels', () => {
    assert.ok(codes(pack({ records: [changedRecord({ fr: '<b>text</b>' })] })).includes('LABEL'));
  });
  it('requires French nonbreaking spacing before colon', () => {
    assert.ok(codes(pack({ records: [changedRecord({ fr: 'Entrée: niveau' })] })).includes('TYPOGRAPHY'));
  });
  it('accepts correct French colon spacing', () => {
    assert.equal(codes(pack({ records: [changedRecord({ fr: 'Entrée\u00a0: niveau' })] })).length, 0);
  });
  it('requires narrow nonbreaking French punctuation', () => {
    assert.ok(codes(pack({ records: [changedRecord({ fr: 'Entrée !' })] })).includes('TYPOGRAPHY'));
  });
  it('rejects tier zero from publication', () => {
    assert.ok(codes(pack({ records: [changedRecord({ tier: 0 })] })).includes('TIER'));
  });
  it('accepts tier one unknown without evidence', () => {
    assert.equal(codes(pack({ records: [changedRecord({ tier: 1, access: 'UNKNOWN', observations: [] })] })).length, 0);
  });
  it('does not assert access without dated evidence', () => {
    assert.ok(codes(pack({ records: [changedRecord({ tier: 1, observations: [] })] })).includes('ASSERTION'));
  });
  it('rejects a tier above supporting observations', () => {
    assert.ok(codes(pack({ records: [changedRecord({ tier: 3 })] })).includes('TIER'));
  });
  it('rejects a higher observation tier than its record', () => {
    assert.ok(codes(pack({ records: [changedRecord({ tier: 1 })] })).includes('TIER'));
  });
  it('accepts well-supported tier three', () => {
    const updated = { ...observation, tier: 3 };
    assert.equal(codes(pack({ records: [changedRecord({ tier: 3, observations: [updated] })] })).length, 0);
  });
  it('rejects unsupported features', () => {
    assert.ok(codes(pack({ records: [changedRecord({ feature: 'flying' })] })).includes('RECORD'));
  });
  it('rejects observations for a different feature', () => {
    assert.ok(codes(pack({ records: [changedRecord({ observations: [{ ...observation, feature: 'parking' }] })] })).includes('OBSERVATION'));
  });
  it('rejects observation dates before the source date', () => {
    assert.ok(codes(pack({ records: [changedRecord({ observations: [{ ...observation, observedOn: '2026-11-09' }] })] })).includes('AGE'));
  });
  it('rejects future observation dates', () => {
    assert.ok(codes(pack({ records: [changedRecord({ observations: [{ ...observation, observedOn: '2026-11-20' }] })] })).includes('AGE'));
  });
  it('rejects an observation from a source not referenced by its record', () => {
    assert.ok(codes(pack({ records: [changedRecord({ observations: [{ ...observation, sourceId: 'other' }] })] })).includes('OBSERVATION'));
  });
  it('rejects conflicting observations when an access state is asserted', () => {
    const no = { ...observation, access: 'NO' };
    assert.ok(codes(pack({ records: [changedRecord({ observations: [observation, no] })] })).includes('CONFLICT'));
  });
  it('permits conflict only when access remains unknown at tier one', () => {
    const no = { ...observation, access: 'NO', tier: 1 };
    const yes = { ...observation, tier: 1 };
    assert.equal(codes(pack({ records: [changedRecord({ tier: 1, access: 'UNKNOWN', observations: [yes, no] })] })).length, 0);
  });
  it('blocks unsupported provenance transfer into the open export', () => {
    const odblSource = changedSource({ licence: 'ODbL-1.0' });
    assert.ok(codes(pack({ sources: [odblSource] })).includes('SILO'));
  });
  it('accepts an isolated source-backed alternate export', () => {
    const odblSource = changedSource({ licence: 'ODbL-1.0' });
    const odblFile = changedFile({ silo: 'odbl' });
    const odblRecord = changedRecord({ silo: 'odbl' });
    assert.equal(codes(pack({ sources: [odblSource], files: [odblFile], records: [odblRecord] })).length, 0);
  });
  it('refuses mismatched record and file export partitions', () => {
    assert.ok(codes(pack({ records: [changedRecord({ silo: 'odbl' })] })).includes('SILO'));
  });
  it('rejects unsafe personal information in visible labels', () => {
    assert.ok(codes(pack({ records: [changedRecord({ en: 'Contact demo@example.com' })] })).includes('LABEL'));
  });
  it('keeps findings in stable order', () => {
    const result = check(pack({ records: [changedRecord({ en: '', fr: '' })] }));
    const sorted = [...result.findings].sort((a, b) => a.path.localeCompare(b.path, 'en') || a.code.localeCompare(b.code, 'en'));
    assert.deepEqual(result.findings, sorted);
  });
});
