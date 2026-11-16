import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseArgs, runGate } from './provenance-cli.mjs';
import { emptyRecord } from './provenance-core.mjs';

const valid = () => JSON.stringify({ version: 1, records: [{
  ...emptyRecord('osm'),
  title: 'Test map source', provider: 'osm', use: 'map', status: 'included',
  sourceName: 'OpenStreetMap', sourceUrl: 'https://www.openstreetmap.org/copyright',
  licence: 'ODbL-1.0', licenceUrl: 'https://www.openstreetmap.org/copyright',
  acquiredOn: '2026-10-01', datasetAsOf: 'UNKNOWN', termsReviewedOn: '2026-10-01',
  notice: '© OpenStreetMap contributors', notes: '', containsOdbl: true,
  derivedFromOdbl: false, redistributionAllowed: true,
}] });

const execute = async (args, content = valid()) => {
  const messages = { output: '', error: '' };
  const exit = await runGate(args, {
    read: async () => content,
    output: (value) => { messages.output += value; },
    error: (value) => { messages.error += value; },
  });
  return { exit, ...messages };
};

describe('CLI argument handling', () => {
  it('requires a file argument', () => {
    assert.throws(() => parseArgs([]), /Usage/u);
  });
  it('accepts plain file argument', () => {
    assert.deepEqual(parseArgs(['inventory.json']), {
      file: 'inventory.json', referenceDate: 'UNKNOWN', json: false,
    });
  });
  it('accepts a reference date', () => {
    assert.equal(parseArgs(['inventory.json', '--date', '2026-11-15']).referenceDate, '2026-11-15');
  });
  it('accepts JSON output', () => {
    assert.equal(parseArgs(['inventory.json', '--json']).json, true);
  });
  it('rejects extra positionals', () => {
    assert.throws(() => parseArgs(['a.json', 'b.json']), /Only one/u);
  });
  it('rejects unrecognised flags', () => {
    assert.throws(() => parseArgs(['a.json', '--unsafe']), /Unknown option/u);
  });
  it('rejects missing date option value', () => {
    assert.throws(() => parseArgs(['a.json', '--date']), /requires/u);
  });
});

describe('CLI release exit codes', () => {
  it('returns zero for complete, permitted source records', async () => {
    const result = await execute(['local.json']);
    assert.equal(result.exit, 0);
    assert.match(result.output, /PASS/u);
  });
  it('returns one for unknown licence', async () => {
    const content = JSON.parse(valid());
    content.records[0].licence = 'UNKNOWN';
    const result = await execute(['local.json'], JSON.stringify(content));
    assert.equal(result.exit, 1);
    assert.match(result.output, /MISSING_LICENCE/u);
  });
  it('returns one for denied redistribution', async () => {
    const content = JSON.parse(valid());
    content.records[0].redistributionAllowed = false;
    const result = await execute(['local.json'], JSON.stringify(content));
    assert.equal(result.exit, 1);
    assert.match(result.output, /REDISTRIBUTION_DENIED/u);
  });
  it('returns one for no included records', async () => {
    const result = await execute(['local.json'], JSON.stringify({ version: 1, records: [] }));
    assert.equal(result.exit, 1);
    assert.match(result.output, /EMPTY_RELEASE/u);
  });
  it('returns two on malformed JSON', async () => {
    const result = await execute(['local.json'], '{');
    assert.equal(result.exit, 2);
    assert.match(result.error, /INVALID_JSON/u);
  });
  it('returns two on schema mismatch', async () => {
    const result = await execute(['local.json'], JSON.stringify({ version: 99, records: [] }));
    assert.equal(result.exit, 2);
    assert.match(result.error, /SCHEMA_VERSION/u);
  });
  it('returns two on file read error', async () => {
    let error = '';
    const exit = await runGate(['missing.json'], {
      read: async () => { throw new Error('ENOENT'); },
      output: () => {},
      error: (value) => { error += value; },
    });
    assert.equal(exit, 2);
    assert.match(error, /ENOENT/u);
  });
  it('emits machine-readable JSON when requested', async () => {
    const result = await execute(['local.json', '--json']);
    const body = JSON.parse(result.output);
    assert.equal(result.exit, 0);
    assert.equal(body.passed, true);
  });
  it('rejects a future acquisition at a supplied date', async () => {
    const content = JSON.parse(valid());
    content.records[0].acquiredOn = '2027-01-01';
    const result = await execute(['local.json', '--date', '2026-11-15'], JSON.stringify(content));
    assert.equal(result.exit, 1);
    assert.match(result.output, /FUTURE_DATE/u);
  });
  it('does not invent a reference date', async () => {
    const result = await execute(['local.json']);
    assert.match(result.output, /Reference date: UNKNOWN/u);
  });
});
