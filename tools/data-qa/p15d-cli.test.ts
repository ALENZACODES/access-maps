import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseP15d, runP15d, type P15dIo } from './p15d-cli.js';

function mock(files: Record<string, unknown>): { io: P15dIo; output: string[]; errors: string[];
  saved: Map<string, string> } {
  const output: string[] = [];
  const errors: string[] = [];
  const saved = new Map<string, string>();
  const io: P15dIo = {
    out: value => { output.push(value); },
    err: value => { errors.push(value); },
    load: async path => {
      if (!(path in files)) throw new Error('No such local input');
      return JSON.stringify(files[path]);
    },
    save: async (path, value) => {
      if (saved.has(path)) throw new Error('Already exists');
      saved.set(path, value);
    },
  };
  return { io, output, errors, saved };
}

describe('P15D CLI command wiring', () => {
  it('exposes a local help entry point', async () => {
    const context = mock({});
    assert.equal(await runP15d(['--help'], context.io), 0);
    assert.match(context.output.join(''), /compare --before/);
    assert.match(context.output.join(''), /closure --input/);
    assert.match(context.output.join(''), /pages --input/);
  });
  it('parses release comparison options', () => {
    assert.deepEqual(parseP15d(['compare', '--before', 'a.json', '--after', 'b.json',
      '--policy', 'p.json', '--format', 'fr']), {
      command: 'compare', before: 'a.json', after: 'b.json', policy: 'p.json', format: 'fr',
    });
  });
  it('rejects unknown commands', () => {
    assert.throws(() => parseP15d(['push', '--input', 'a.json']));
  });
  it('rejects duplicate flags', () => {
    assert.throws(() => parseP15d(['pages', '--input', 'a', '--input', 'b']));
  });
  it('rejects missing required flags', () => {
    assert.throws(() => parseP15d(['compare', '--before', 'a']));
  });
  it('rejects unexpected flags across commands', () => {
    assert.throws(() => parseP15d(['pages', '--input', 'a', '--policy', 'b']));
  });
  it('returns exit code 2 on malformed options', async () => {
    const context = mock({});
    assert.equal(await runP15d(['pages'], context.io), 2);
    assert.match(context.errors.join(''), /Missing --input/);
  });
  it('returns exit code 2 on malformed JSON payload', async () => {
    const context = mock({ input: { wrong: true } });
    assert.equal(await runP15d(['pages', '--input', 'input'], context.io), 2);
    assert.match(context.errors.join(''), /Malformed page input/);
  });
  it('returns exit code 1 on a failing page check', async () => {
    const context = mock({ input: [{ file: 'bad.html', html: '<html></html>' }] });
    assert.equal(await runP15d(['pages', '--input', 'input'], context.io), 1);
    assert.match(context.output.join(''), /DOCUMENT/);
  });
  it('writes a local report exclusively through the I/O adapter', async () => {
    const context = mock({ input: [{ file: 'bad.html', html: '<html></html>' }] });
    assert.equal(await runP15d(['pages', '--input', 'input', '--output', 'report.json'], context.io), 1);
    assert.ok(context.saved.has('report.json'));
  });
  it('does not overwrite a previously saved report', async () => {
    const context = mock({ input: [{ file: 'bad.html', html: '<html></html>' }] });
    const argv = ['pages', '--input', 'input', '--output', 'report.json'];
    assert.equal(await runP15d(argv, context.io), 1);
    assert.equal(await runP15d(argv, context.io), 2);
    assert.match(context.errors.join(''), /Already exists/);
  });
  it('returns exit code 2 when a local file is absent', async () => {
    const context = mock({});
    assert.equal(await runP15d(['closure', '--input', 'missing.json'], context.io), 2);
    assert.match(context.errors.join(''), /No such local input/);
  });
  it('executes the release comparison gate from its command', async () => {
    const snapshot = { schemaVersion: 1, generatedOn: '2026-11-10', assets: [], regions: [] };
    const policy = { asOf: '2026-11-15', maxAgeDays: 60, maxLossOfPresentCells: 0,
      maxUnexplainedAssetRemoval: 0, maxBytes: 10000 };
    const context = mock({ a: snapshot, b: snapshot, p: policy });
    assert.equal(await runP15d(['compare', '--before', 'a', '--after', 'b', '--policy', 'p'], context.io), 0);
    assert.match(context.output.join(''), /"ok": true/);
  });
  it('returns exit code 1 for blocked release changes', async () => {
    const before = { schemaVersion: 1, generatedOn: '2026-11-10', assets: [],
      regions: [{ id: 'region', cells: [] }] };
    const after = { ...before, generatedOn: '2026-11-11', regions: [] };
    const policy = { asOf: '2026-11-15', maxAgeDays: 60, maxLossOfPresentCells: 0,
      maxUnexplainedAssetRemoval: 0, maxBytes: 10000 };
    const context = mock({ a: before, b: after, p: policy });
    assert.equal(await runP15d(['compare', '--before', 'a', '--after', 'b',
      '--policy', 'p', '--format', 'fr'], context.io), 1);
    assert.match(context.output.join(''), /Une région a disparu/);
  });
  it('executes the closure checker through its command', async () => {
    const context = mock({ closure: { root: '.', entries: [], pagePaths: [],
      maxFileBytes: 100, maxTotalBytes: 100 } });
    assert.equal(await runP15d(['closure', '--input', 'closure'], context.io), 1);
    assert.match(context.output.join(''), /NO_ENTRY/);
  });
});

// Imported by the already-wired CI regression test entry point.
import './p15e-evidence.test.ts';
import './p15e-locales.test.ts';
import './p15e-updates.test.ts';
import './p15e-cli.test.ts';
import './p15e-attribution.test.ts';
