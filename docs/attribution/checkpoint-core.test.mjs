import test from 'node:test';
import assert from 'node:assert/strict';
import { CHECKPOINT_MAX_BYTES, CHECKPOINT_SCHEMA, CheckpointInputError, checkpointMetadata, parseCheckpoint, parseCheckpointJson, writeCheckpointJson } from './checkpoint-core.mjs';
import { checkpointFixture, mutatedSource, mutatedSurface, sourceFixture, surfaceFixture } from './checkpoint-fixtures.mjs';

test('strict contract parses an explicit release', () => {
  const parsed = parseCheckpoint(checkpointFixture());
  assert.equal(parsed.schema, CHECKPOINT_SCHEMA);
  assert.equal(parsed.sources[0].datasetDate, 'UNKNOWN');
  assert.equal(parsed.surfaces[0].targetPx, 44);
});
test('roundtrip JSON preserves unknown and does not inject date', () => {
  const source = checkpointFixture();
  assert.deepEqual(parseCheckpointJson(writeCheckpointJson(source)), source);
});
test('parsed result has fresh record arrays', () => {
  const original = checkpointFixture();
  const parsed = parseCheckpoint(original);
  assert.notEqual(parsed.sources, original.sources);
  assert.notEqual(parsed.sources[0], original.sources[0]);
  assert.notEqual(parsed.surfaces, original.surfaces);
});
test('metadata counts unknown and pending evidence', () => {
  const meta = checkpointMetadata(checkpointFixture({ sources: [sourceFixture(), sourceFixture({ id: 'other-source', permission: 'UNKNOWN', decision: 'held', publication: 'held' })] }));
  assert.equal(meta.sourceCount, 2);
  assert.equal(meta.unknownDatasetDates, 2);
  assert.equal(meta.pendingDecisions, 1);
  assert.equal(meta.includedSources, 1);
});
test('rejects malformed root values', () => {
  for (const value of [null, [], {}, false, 0, 'text']) assert.throws(() => parseCheckpoint(value), CheckpointInputError);
});
test('rejects incorrect or missing schemas', () => {
  assert.throws(() => parseCheckpoint({ ...checkpointFixture(), schema: 'other' }), /Unsupported schema/);
  const { schema, ...without } = checkpointFixture();
  assert.equal(schema, CHECKPOINT_SCHEMA);
  assert.throws(() => parseCheckpoint(without), /Missing field/);
});
test('rejects additional properties on all record types', () => {
  assert.throws(() => parseCheckpoint({ ...checkpointFixture(), extra: 1 }), /Unexpected field/);
  assert.throws(() => parseCheckpoint(mutatedSource({ extra: 1 })), /Unexpected field/);
  assert.throws(() => parseCheckpoint(mutatedSurface({ extra: 1 })), /Unexpected field/);
});
test('duplicate identities are rejected', () => {
  assert.throws(() => parseCheckpoint(checkpointFixture({ sources: [sourceFixture(), sourceFixture()] })), /Duplicate identity/);
  assert.throws(() => parseCheckpoint(checkpointFixture({ surfaces: [surfaceFixture(), surfaceFixture()] })), /Duplicate identity/);
  assert.throws(() => parseCheckpoint(mutatedSurface({ sourceIds: ['sample-source', 'sample-source'] })), /Duplicate identity/);
});
test('invalid date formats and calendar dates are rejected', () => {
  for (const value of ['2026-02-30', '2026-13-01', '2026-00-05', '2026-01-00', '2026/10/11', 'today', '', null, '1899-12-31']) {
    assert.throws(() => parseCheckpoint(mutatedSource({ termsDate: value })), CheckpointInputError, String(value));
  }
});
test('leap-day validation uses full Gregorian rules', () => {
  assert.equal(parseCheckpoint(mutatedSource({ termsDate: '2024-02-29' })).sources[0].termsDate, '2024-02-29');
  assert.throws(() => parseCheckpoint(mutatedSource({ termsDate: '2100-02-29' })), /Invalid calendar date/);
});
test('all required source dates accept explicit UNKNOWN', () => {
  for (const key of ['termsDate', 'datasetDate', 'acquisitionDate', 'decisionDate']) {
    const result = parseCheckpoint(mutatedSource({ [key]: 'UNKNOWN' }));
    assert.equal(result.sources[0][key], 'UNKNOWN');
  }
});
test('unsafe or private origin URLs are not accepted', () => {
  const urls = ['http://example.org/terms', 'javascript:alert(1)', 'file:///tmp/a', 'https://localhost/a', 'https://127.0.0.1/a', 'https://192.168.0.5/a', 'https://test.local/a', 'https://[::1]/', 'https://user:pass@example.org/a', 'https://example.org/a#section'];
  for (const value of urls) assert.throws(() => parseCheckpoint(mutatedSource({ sourceUrl: value })), CheckpointInputError, value);
});
test('unknown URLs are represented, never invented', () => {
  const result = parseCheckpoint(mutatedSource({ licenceUrl: 'UNKNOWN', evidenceUrl: 'UNKNOWN' }));
  assert.equal(result.sources[0].licenceUrl, 'UNKNOWN');
  assert.equal(result.sources[0].evidenceUrl, 'UNKNOWN');
});
test('URL input uses canonical https structure', () => {
  assert.equal(parseCheckpoint(mutatedSource({ sourceUrl: 'https://example.org' })).sources[0].sourceUrl, 'https://example.org/');
});
test('HTML-like data is accepted as text and never executed by parser', () => {
  const result = parseCheckpoint(mutatedSource({ name: '<em>Source</em>', notice: '<script>alert(1)</script>' }));
  assert.equal(result.sources[0].name, '<em>Source</em>');
});
test('controls and unnormalized text are rejected', () => {
  for (const value of ['bad\0word', 'bad\x1fword', 'e\u0301']) assert.throws(() => parseCheckpoint(mutatedSource({ name: value })), CheckpointInputError);
});
test('notice text permits multiline legal text', () => {
  const result = parseCheckpoint(mutatedSource({ notice: 'First line\nSecond line' }));
  assert.equal(result.sources[0].notice, 'First line\nSecond line');
});
test('unknown status options are rejected', () => {
  for (const [key, values] of [['permission', ['maybe', true, 1]], ['evidenceTier', ['highest', 'none']], ['decision', ['ready', 'approved']], ['publication', ['publish', 'YES']]]) {
    for (const value of values) assert.throws(() => parseCheckpoint(mutatedSource({ [key]: value })), CheckpointInputError);
  }
});
test('unknown surface options are rejected', () => {
  for (const [key, values] of [['offline', ['maybe', 1]], ['keyboard', [false]], ['locale', ['fr-CA', 'es']], ['mode', ['maps', 'UNKNOWN']], ['targetPx', [-1, 43.5, Infinity, null, 1001]]]) {
    for (const value of values) assert.throws(() => parseCheckpoint(mutatedSurface({ [key]: value })), CheckpointInputError);
  }
});
test('minimum target is not auto-filled', () => {
  const value = parseCheckpoint(mutatedSurface({ targetPx: 'UNKNOWN' }));
  assert.equal(value.surfaces[0].targetPx, 'UNKNOWN');
});
test('input size limit protects file imports', () => {
  assert.throws(() => parseCheckpointJson(' '.repeat(CHECKPOINT_MAX_BYTES + 1)), /size limit/);
});
test('malformed JSON fails with a domain-specific error', () => {
  for (const input of ['not json', '{', '[', 'null']) assert.throws(() => parseCheckpointJson(input), CheckpointInputError);
});
test('rejects unsupported identifier forms', () => {
  for (const id of ['Capital', 'a_b', ' space', '1abc', 'a--b', '', 'a'.repeat(73)]) assert.throws(() => parseCheckpoint(mutatedSource({ id })), CheckpointInputError);
});
