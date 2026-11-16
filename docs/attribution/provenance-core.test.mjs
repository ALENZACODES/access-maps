import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  UNKNOWN, SCHEMA_VERSION, MAX_RECORDS, MAX_DOCUMENT_BYTES,
  PROVIDERS, LICENCES, USES, STATUSES, REQUIRED_FIELDS,
  ProvenanceError, isPlainObject, isKnownDate, isUnknownOrDate,
  isSafeUrl, emptyRecord, emptyInventory, parseRecord, parseInventory,
  parseInventoryText, encodeInventory, upsertRecord, removeRecord,
  markRecord, cloneRecord, filterRecords, inventoryStats, isReleaseCandidate,
} from './provenance-core.mjs';

function sample(overrides = {}) {
  return {
    ...emptyRecord('sample-one'),
    title: 'Sample local inventory',
    provider: 'osm',
    use: 'map',
    status: 'included',
    sourceName: 'OpenStreetMap',
    sourceUrl: 'https://www.openstreetmap.org/copyright',
    licence: 'ODbL-1.0',
    licenceUrl: 'https://opendatacommons.org/licenses/odbl/',
    acquiredOn: '2026-10-01',
    datasetAsOf: UNKNOWN,
    termsReviewedOn: '2026-10-02',
    notice: '© OpenStreetMap contributors',
    notes: 'Local test example',
    containsOdbl: true,
    derivedFromOdbl: false,
    redistributionAllowed: true,
    ...overrides,
  };
}

function inventory(records = [sample()]) {
  return { version: SCHEMA_VERSION, records };
}

function expectError(action, code) {
  assert.throws(action, (error) => error instanceof ProvenanceError && error.code === code);
}

describe('strict record shape', () => {
  it('exposes the explicit schema version', () => {
    assert.equal(SCHEMA_VERSION, 1);
  });
  it('starts with no published datasets', () => {
    assert.deepEqual(emptyInventory(), { version: 1, records: [] });
  });
  it('preserves UNKNOWN in every undisclosed fact', () => {
    const record = emptyRecord('local');
    for (const key of ['title', 'sourceName', 'sourceUrl', 'licence',
      'licenceUrl', 'acquiredOn', 'datasetAsOf', 'termsReviewedOn',
      'notice', 'containsOdbl', 'derivedFromOdbl', 'redistributionAllowed']) {
      assert.equal(record[key], UNKNOWN, key);
    }
    assert.equal(record.status, 'held');
  });
  it('parses complete records without dropping facts', () => {
    assert.deepEqual(parseRecord(sample()), sample());
  });
  it('freezes output records', () => {
    assert.equal(Object.isFrozen(parseRecord(sample())), true);
  });
  it('rejects null input', () => {
    expectError(() => parseRecord(null), 'NOT_OBJECT');
  });
  it('rejects array input', () => {
    expectError(() => parseRecord([]), 'NOT_OBJECT');
  });
  it('rejects unexpected keys', () => {
    expectError(() => parseRecord({ ...sample(), unreviewed: true }), 'UNEXPECTED_FIELD');
  });
  it('rejects absent required keys individually', () => {
    for (const key of REQUIRED_FIELDS) {
      const value = sample();
      delete value[key];
      expectError(() => parseRecord(value), 'MISSING_FIELD');
    }
  });
  it('rejects invalid identifiers', () => {
    for (const id of ['', '_one', 'A', 'a/b', 'a b', 'a.'.repeat(40), '1start']) {
      expectError(() => parseRecord(sample({ id })), (!id || id.length > 64) ? 'INVALID_TEXT' : 'INVALID_ID');
    }
  });
  it('accepts boundary-safe identifiers', () => {
    for (const id of ['a', 'a0', 'dataset_one', 'dataset-two', `a${'b'.repeat(63)}`]) {
      assert.equal(parseRecord(sample({ id })).id, id);
    }
  });
  it('rejects unknown provider labels', () => {
    expectError(() => parseRecord(sample({ provider: 'fake' })), 'INVALID_VALUE');
  });
  it('rejects unknown use labels', () => {
    expectError(() => parseRecord(sample({ use: 'car' })), 'INVALID_VALUE');
  });
  it('rejects unknown status labels', () => {
    expectError(() => parseRecord(sample({ status: 'ready' })), 'INVALID_VALUE');
  });
  it('rejects unknown licence labels', () => {
    expectError(() => parseRecord(sample({ licence: 'closed' })), 'INVALID_VALUE');
  });
  it('accepts each explicitly recognised provider', () => {
    for (const provider of PROVIDERS) assert.equal(parseRecord(sample({ provider })).provider, provider);
  });
  it('accepts each explicitly recognised licence label', () => {
    for (const licence of LICENCES) assert.equal(parseRecord(sample({ licence })).licence, licence);
  });
  it('accepts each recognised use', () => {
    for (const use of USES) assert.equal(parseRecord(sample({ use })).use, use);
  });
  it('accepts each recognised status', () => {
    for (const status of STATUSES) assert.equal(parseRecord(sample({ status })).status, status);
  });
  it('rejects non-string titles', () => {
    expectError(() => parseRecord(sample({ title: 100 })), 'INVALID_TEXT');
  });
  it('rejects empty titles', () => {
    expectError(() => parseRecord(sample({ title: ' ' })), 'INVALID_TEXT');
  });
  it('rejects control characters in notes', () => {
    expectError(() => parseRecord(sample({ notes: 'abc\u0000def' })), 'CONTROL_CHARACTER');
  });
  it('permits empty optional notes', () => {
    assert.equal(parseRecord(sample({ notes: '' })).notes, '');
  });
  it('rejects overlong notes', () => {
    expectError(() => parseRecord(sample({ notes: 'a'.repeat(4001) })), 'INVALID_TEXT');
  });
  it('rejects overlong notices', () => {
    expectError(() => parseRecord(sample({ notice: 'a'.repeat(4001) })), 'INVALID_TEXT');
  });
  it('rejects overlong titles', () => {
    expectError(() => parseRecord(sample({ title: 'a'.repeat(501) })), 'INVALID_TEXT');
  });
  it('rejects non-boolean tri-state values', () => {
    for (const key of ['containsOdbl', 'derivedFromOdbl', 'redistributionAllowed']) {
      for (const value of ['true', 'false', 0, null, undefined]) {
        expectError(() => parseRecord(sample({ [key]: value })), 'INVALID_TRISTATE');
      }
    }
  });
  it('preserves explicit false without converting it to UNKNOWN', () => {
    for (const key of ['containsOdbl', 'derivedFromOdbl', 'redistributionAllowed']) {
      assert.equal(parseRecord(sample({ [key]: false }))[key], false);
    }
  });
});

describe('date validation', () => {
  it('accepts valid leap dates', () => {
    assert.equal(isKnownDate('2024-02-29'), true);
  });
  it('rejects invalid leap dates', () => {
    assert.equal(isKnownDate('2025-02-29'), false);
  });
  it('rejects day zero', () => {
    assert.equal(isKnownDate('2026-01-00'), false);
  });
  it('rejects month thirteen', () => {
    assert.equal(isKnownDate('2026-13-01'), false);
  });
  it('rejects impossible thirty-firsts', () => {
    assert.equal(isKnownDate('2026-04-31'), false);
  });
  it('rejects times and timezone suffixes', () => {
    assert.equal(isKnownDate('2026-04-01T00:00:00Z'), false);
  });
  it('rejects loosely formatted dates', () => {
    assert.equal(isKnownDate('2026-4-1'), false);
  });
  it('rejects years before supported range', () => {
    assert.equal(isKnownDate('0000-01-01'), false);
  });
  it('accepts UNKNOWN as a first-class date result', () => {
    assert.equal(isUnknownOrDate(UNKNOWN), true);
  });
  it('rejects null as a date', () => {
    assert.equal(isUnknownOrDate(null), false);
  });
  it('rejects malformed dates for each date field', () => {
    for (const key of ['acquiredOn', 'datasetAsOf', 'termsReviewedOn']) {
      expectError(() => parseRecord(sample({ [key]: 'tomorrow' })), 'INVALID_DATE');
    }
  });
});

describe('source URL safety', () => {
  it('accepts HTTPS URLs', () => {
    assert.equal(isSafeUrl('https://example.org/dataset'), true);
  });
  it('preserves UNKNOWN rather than creating a URL', () => {
    assert.equal(isSafeUrl(UNKNOWN), true);
  });
  it('rejects HTTP URLs', () => {
    assert.equal(isSafeUrl('http://example.org'), false);
  });
  it('rejects script URLs', () => {
    assert.equal(isSafeUrl('javascript:alert(1)'), false);
  });
  it('rejects data URLs', () => {
    assert.equal(isSafeUrl('data:text/html,x'), false);
  });
  it('rejects relative URLs', () => {
    assert.equal(isSafeUrl('../source'), false);
  });
  it('rejects embedded credentials', () => {
    assert.equal(isSafeUrl('https://user:pass@example.org'), false);
  });
  it('rejects whitespace in URLs', () => {
    assert.equal(isSafeUrl('https://example.org/a b'), false);
  });
  it('rejects localhost', () => {
    assert.equal(isSafeUrl('https://localhost/data'), false);
  });
  it('rejects local domains', () => {
    assert.equal(isSafeUrl('https://service.local/data'), false);
  });
  it('rejects non-string URLs', () => {
    assert.equal(isSafeUrl(20), false);
  });
  it('rejects overlong URLs', () => {
    assert.equal(isSafeUrl(`https://example.org/${'a'.repeat(2100)}`), false);
  });
  it('checks source and licence URL fields separately', () => {
    for (const key of ['sourceUrl', 'licenceUrl']) {
      expectError(() => parseRecord(sample({ [key]: 'file:///secret' })), 'UNSAFE_URL');
    }
  });
});

describe('inventory operations', () => {
  it('rejects non-object inventories', () => {
    expectError(() => parseInventory([]), 'NOT_OBJECT');
  });
  it('rejects unsupported versions', () => {
    expectError(() => parseInventory({ ...inventory(), version: 2 }), 'SCHEMA_VERSION');
  });
  it('rejects unexpected inventory keys', () => {
    expectError(() => parseInventory({ ...inventory(), secret: 1 }), 'UNEXPECTED_FIELD');
  });
  it('requires the records array', () => {
    expectError(() => parseInventory({ version: 1 }), 'NOT_ARRAY');
  });
  it('limits record counts', () => {
    expectError(() => parseInventory(inventory(Array.from({ length: MAX_RECORDS + 1 },
      (_, index) => sample({ id: `record-${index}` })))), 'TOO_MANY_RECORDS');
  });
  it('rejects duplicate identifiers', () => {
    expectError(() => parseInventory(inventory([sample(), sample()])), 'DUPLICATE_ID');
  });
  it('accepts a record at the maximum count', () => {
    const records = Array.from({ length: MAX_RECORDS },
      (_, index) => sample({ id: `record-${index}` }));
    assert.equal(parseInventory(inventory(records)).records.length, MAX_RECORDS);
  });
  it('serializes and deserializes all fields', () => {
    assert.deepEqual(parseInventoryText(encodeInventory(inventory())), parseInventory(inventory()));
  });
  it('adds a new record', () => {
    assert.equal(upsertRecord(emptyInventory(), sample()).records.length, 1);
  });
  it('replaces a record rather than duplicating', () => {
    const result = upsertRecord(inventory(), sample({ title: 'New title' }));
    assert.equal(result.records.length, 1);
    assert.equal(result.records[0].title, 'New title');
  });
  it('sorts records by identifier', () => {
    const result = upsertRecord(inventory([sample({ id: 'z' })]), sample({ id: 'a' }));
    assert.deepEqual(result.records.map((item) => item.id), ['a', 'z']);
  });
  it('removes a record by ID', () => {
    assert.equal(removeRecord(inventory(), 'sample-one').records.length, 0);
  });
  it('does not remove unrelated records', () => {
    const result = removeRecord(inventory(), 'unrelated');
    assert.equal(result.records.length, 1);
  });
  it('changes status explicitly', () => {
    assert.equal(markRecord(inventory(), 'sample-one', 'held').records[0].status, 'held');
  });
  it('rejects status changes for absent records', () => {
    expectError(() => markRecord(inventory(), 'absent', 'included'), 'NOT_FOUND');
  });
  it('rejects unsupported status changes', () => {
    expectError(() => markRecord(inventory(), 'sample-one', 'maybe'), 'INVALID_VALUE');
  });
  it('clones as held, never included', () => {
    const cloned = cloneRecord(sample(), 'copy');
    assert.equal(cloned.status, 'held');
    assert.equal(cloned.id, 'copy');
  });
  it('filters records by status', () => {
    const result = filterRecords(inventory([sample(), sample({ id: 'second', status: 'held' })]),
      { status: 'held' });
    assert.deepEqual(result.map((record) => record.id), ['second']);
  });
  it('filters records by provider', () => {
    const result = filterRecords(inventory([sample(), sample({ id: 'second', provider: 'ltc' })]),
      { provider: 'ltc' });
    assert.deepEqual(result.map((record) => record.id), ['second']);
  });
  it('searches without case sensitivity', () => {
    assert.equal(filterRecords(inventory(), { text: 'SAMPLE LOCAL' }).length, 1);
  });
  it('returns no matches for unrelated text', () => {
    assert.equal(filterRecords(inventory(), { text: 'unrelated' }).length, 0);
  });
  it('counts missing dataset dates explicitly', () => {
    assert.equal(inventoryStats(inventory()).missingDates, 1);
  });
  it('counts unknown licences explicitly', () => {
    assert.equal(inventoryStats(inventory([sample({ licence: UNKNOWN })])).unknownLicences, 1);
  });
  it('returns all status counts', () => {
    const records = [sample(), sample({ id: 'held', status: 'held' }),
      sample({ id: 'excluded', status: 'excluded' })];
    assert.deepEqual(inventoryStats(inventory(records)).byStatus,
      { included: 1, held: 1, excluded: 1 });
  });
  it('checks release candidate status only', () => {
    assert.equal(isReleaseCandidate(sample()), true);
    assert.equal(isReleaseCandidate(sample({ status: 'held' })), false);
  });
  it('fails invalid JSON', () => {
    expectError(() => parseInventoryText('{'), 'INVALID_JSON');
  });
  it('fails oversized documents before parsing JSON', () => {
    expectError(() => parseInventoryText(' '.repeat(MAX_DOCUMENT_BYTES + 1)), 'FILE_TOO_LARGE');
  });
  it('fails malformed inputs that are not text', () => {
    expectError(() => parseInventoryText(null), 'INVALID_TEXT');
  });
  it('does not mutate the caller when replacing records', () => {
    const original = inventory();
    const next = upsertRecord(original, sample({ title: 'Replacement' }));
    assert.equal(original.records[0].title, 'Sample local inventory');
    assert.equal(next.records[0].title, 'Replacement');
  });
  it('accepts ordinary objects without requiring a class instance', () => {
    assert.equal(isPlainObject(sample()), true);
    assert.equal(isPlainObject(new Date()), false);
  });
});
