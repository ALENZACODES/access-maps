import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMMANDS, USAGE, formatReport, parseArgs, runP15k } from './p15k-cli.mjs';
import { catalogue, clone, history, refresh } from './p15k-fixtures.mjs';

function mock(files = {}) {
  const output = [];
  const errors = [];
  const saved = new Map();
  let reads = 0;
  const io = {
    load: async file => {
      reads++;
      if (!Object.hasOwn(files, file)) throw new Error('File missing');
      const value = files[file];
      return typeof value === 'string' ? value : JSON.stringify(value);
    },
    save: async (name, text) => {
      if (saved.has(name)) throw new Error('Cannot overwrite a report');
      saved.set(name, text);
    },
    out: text => { output.push(text); },
    err: text => { errors.push(text); },
  };
  return { io, output, errors, saved, get reads() { return reads; } };
}

describe('P15K local-only publication CLI parsing', () => {
  it('lists all three standalone audit gates and comparison', () => {
    assert.deepEqual(COMMANDS, ['history', 'compare-history', 'refresh', 'disclosures']);
  });
  it('explains valid exit codes in help text', () => {
    assert.match(USAGE, /0 passed, 1 blocked, 2 malformed/u);
  });
  it('accepts the help command', () => {
    assert.deepEqual(parseArgs(['--help']), { command: 'help' });
  });
  it('parses the history input', () => {
    assert.equal(parseArgs(['history', '--input', 'history.json']).input, 'history.json');
  });
  it('parses the refresh input', () => {
    assert.equal(parseArgs(['refresh', '--input', 'refresh.json']).command, 'refresh');
  });
  it('parses disclosures with a French report', () => {
    assert.equal(parseArgs(['disclosures', '--input', 'input', '--format', 'fr']).format, 'fr');
  });
  it('parses two separate comparison paths', () => {
    const value = parseArgs(['compare-history', '--before', 'one', '--after', 'two']);
    assert.equal(value.before, 'one');
    assert.equal(value.after, 'two');
  });
  it('defaults to JSON report output', () => {
    assert.equal(parseArgs(['history', '--input', 'one']).format, 'json');
  });
  it('rejects unrecognised commands', () => {
    assert.throws(() => parseArgs(['upload', '--input', 'one']));
  });
  it('rejects repeated input flags', () => {
    assert.throws(() => parseArgs(['history', '--input', 'one', '--input', 'two']));
  });
  it('rejects unsupported report formats', () => {
    assert.throws(() => parseArgs(['history', '--input', 'one', '--format', 'html']));
  });
  it('rejects missing input paths', () => {
    assert.throws(() => parseArgs(['history']));
  });
  it('rejects missing comparison snapshots', () => {
    assert.throws(() => parseArgs(['compare-history', '--before', 'one']));
  });
  it('rejects identical before and after filenames', () => {
    assert.throws(() => parseArgs(['compare-history', '--before', 'same', '--after', 'same']));
  });
  it('rejects input and output filename collisions', () => {
    assert.throws(() => parseArgs(['refresh', '--input', 'same', '--output', 'same']));
  });
  it('rejects output overwriting a comparison input', () => {
    assert.throws(() => parseArgs(['compare-history', '--before', 'one', '--after', 'two', '--output', 'one']));
  });
  it('rejects compare-history --input rather than --before/--after', () => {
    assert.throws(() => parseArgs(['compare-history', '--input', 'one']));
  });
  it('rejects unexpected comparison flags on normal gates', () => {
    assert.throws(() => parseArgs(['disclosures', '--input', 'one', '--before', 'two']));
  });
  it('rejects an option without a following value', () => {
    assert.throws(() => parseArgs(['history', '--input']));
  });
});

describe('P15K executable release gates', () => {
  it('prints help without reading files', async () => {
    const ctx = mock();
    assert.equal(await runP15k(['--help'], ctx.io), 0);
    assert.equal(ctx.reads, 0);
    assert.match(ctx.output.join(''), /disclosures --input/u);
  });
  it('blocks malformed commands with exit code 2', async () => {
    const ctx = mock();
    assert.equal(await runP15k(['history'], ctx.io), 2);
    assert.equal(ctx.reads, 0);
  });
  it('allows a valid evidence history', async () => {
    const ctx = mock({ input: history() });
    assert.equal(await runP15k(['history', '--input', 'input'], ctx.io), 0);
    assert.match(ctx.output.join(''), /"ok": true/u);
  });
  it('allows a no-change refresh', async () => {
    const ctx = mock({ input: refresh() });
    assert.equal(await runP15k(['refresh', '--input', 'input'], ctx.io), 0);
  });
  it('allows an UNKNOWN-only offline disclosure', async () => {
    const ctx = mock({ input: catalogue() });
    assert.equal(await runP15k(['disclosures', '--input', 'input'], ctx.io), 0);
  });
  it('blocks an unsupported change in the publication history', async () => {
    const value = history();
    value.decisions[0].access = 'NO';
    const ctx = mock({ input: value });
    assert.equal(await runP15k(['history', '--input', 'input'], ctx.io), 1);
    assert.match(ctx.output.join(''), /EVIDENCE/u);
  });
  it('blocks offline package storage overages', async () => {
    const ctx = mock({ input: refresh({ maxTotalBytes: 1 }) });
    assert.equal(await runP15k(['refresh', '--input', 'input'], ctx.io), 1);
  });
  it('blocks undersized interactive controls', async () => {
    const value = catalogue();
    value.controls[0].heightPx = 43;
    const ctx = mock({ input: value });
    assert.equal(await runP15k(['disclosures', '--input', 'input'], ctx.io), 1);
    assert.match(ctx.output.join(''), /TARGET/u);
  });
  it('compares unchanged publication histories', async () => {
    const ctx = mock({ old: history(), next: clone(history()) });
    assert.equal(await runP15k(['compare-history', '--before', 'old', '--after', 'next'], ctx.io), 0);
  });
  it('blocks silently removed evidence between releases', async () => {
    const before = history();
    const next = history({ observations: [], decisions: [] });
    const ctx = mock({ before, next });
    assert.equal(await runP15k(['compare-history', '--before', 'before', '--after', 'next'], ctx.io), 1);
    assert.match(ctx.output.join(''), /REMOVAL/u);
  });
  it('outputs a human-readable French failure report', async () => {
    const ctx = mock({ input: refresh({ maxTotalBytes: 1 }) });
    assert.equal(await runP15k(['refresh', '--input', 'input', '--format', 'fr'], ctx.io), 1);
    assert.match(ctx.output.join(''), /Exportation bloquée/u);
  });
  it('outputs a human-readable English failure report', async () => {
    const ctx = mock({ input: refresh({ maxTotalBytes: 1 }) });
    assert.equal(await runP15k(['refresh', '--input', 'input', '--format', 'en'], ctx.io), 1);
    assert.match(ctx.output.join(''), /Export blocked/u);
  });
  it('writes a local report only when requested', async () => {
    const ctx = mock({ input: catalogue() });
    assert.equal(await runP15k(['disclosures', '--input', 'input', '--output', 'report.json'], ctx.io), 0);
    assert.equal(ctx.saved.get('report.json'), ctx.output.join(''));
  });
  it('does not overwrite an existing local report', async () => {
    const ctx = mock({ input: catalogue() });
    await runP15k(['disclosures', '--input', 'input', '--output', 'report.json'], ctx.io);
    assert.equal(await runP15k(['disclosures', '--input', 'input', '--output', 'report.json'], ctx.io), 2);
    assert.match(ctx.errors.join(''), /Cannot overwrite/u);
  });
  it('returns exit code 2 on malformed JSON', async () => {
    const ctx = mock({ input: '{not-json' });
    assert.equal(await runP15k(['history', '--input', 'input'], ctx.io), 2);
  });
  it('returns exit code 2 on missing local files', async () => {
    const ctx = mock();
    assert.equal(await runP15k(['refresh', '--input', 'missing'], ctx.io), 2);
    assert.match(ctx.errors.join(''), /File missing/u);
  });
  it('returns exit code 2 on oversized input', async () => {
    const ctx = mock({ input: ' '.repeat(8 * 1024 * 1024 + 1) });
    assert.equal(await runP15k(['history', '--input', 'input'], ctx.io), 2);
  });
  it('does not invoke a local save when no output was requested', async () => {
    const ctx = mock({ input: refresh() });
    assert.equal(await runP15k(['refresh', '--input', 'input'], ctx.io), 0);
    assert.equal(ctx.saved.size, 0);
  });
  it('formats JSON with a trailing newline', () => {
    const sample = { ok: true, findings: [], summary: {} };
    assert.ok(formatReport(sample, 'json').endsWith('\n'));
  });
  it('rejects unsupported render locales', () => {
    assert.throws(() => formatReport({ ok: true, findings: [], summary: {} }, 'de'));
  });
});
