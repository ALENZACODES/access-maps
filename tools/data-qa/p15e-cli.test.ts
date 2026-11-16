import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseP15e, runP15e } from './p15e-cli.js';
import { runP15d } from './p15d-cli.js';

function mock(files: Record<string, unknown>) {
  const output: string[] = [];
  const errors: string[] = [];
  const saved = new Map<string, string>();
  const io = {
    load: async (file: string) => {
      if (!Object.hasOwn(files, file)) throw new Error('Not found');
      const data = files[file];
      return typeof data === 'string' ? data : JSON.stringify(data);
    },
    save: async (path: string, value: string) => {
      if (saved.has(path)) throw new Error('Already exists');
      saved.set(path, value);
    },
    out: (value: string) => { output.push(value); },
    err: (value: string) => { errors.push(value); },
  };
  return { io, output, errors, saved };
}
const rejectedCatalog = { schemaVersion: 1, entries: [], pages: [] };
const rejectedEvidence = { schemaVersion: 1, asOf: '2026-11-15', maxAgeDays: 30,
  observations: [], decisions: [] };
const rejectedUpdate = { schemaVersion: 1, asOf: '2026-11-15', maxAgeDays: 30,
  maxBytes: 100, before: {}, after: {}, operations: [] };

describe('P15E CLI integrated in the live P15D command', () => {
  it('parses valid evidence command', () => {
    assert.deepEqual(parseP15e(['evidence', '--input', 'input.json']), {
      command: 'evidence', input: 'input.json', format: 'json',
    });
  });
  it('parses explicit bilingual reporting', () => {
    assert.equal(parseP15e(['locales', '--input', 'in', '--format', 'fr']).format, 'fr');
  });
  it('rejects invalid commands', () => {
    assert.throws(() => parseP15e(['unknown', '--input', 'in']));
  });
  it('rejects repeated options', () => {
    assert.throws(() => parseP15e(['locales', '--input', 'a', '--input', 'b']));
  });
  it('rejects identical input/output paths', () => {
    assert.throws(() => parseP15e(['updates', '--input', 'in', '--output', 'in']));
  });
  it('rejects unsupported formats', () => {
    assert.throws(() => parseP15e(['updates', '--input', 'in', '--format', 'xml']));
  });
  it('rejects missing input option', () => {
    assert.throws(() => parseP15e(['evidence']));
  });
  it('executes evidence audit via live CLI', async () => {
    const ctx = mock({ input: rejectedEvidence });
    assert.equal(await runP15d(['evidence', '--input', 'input'], ctx.io), 0);
    assert.match(ctx.output.join(''), /"observations": 0/);
  });
  it('executes locale audit via live CLI', async () => {
    const ctx = mock({ input: rejectedCatalog });
    assert.equal(await runP15d(['locales', '--input', 'input'], ctx.io), 1);
    assert.match(ctx.output.join(''), /STATUS/);
  });
  it('executes update audit via live CLI', async () => {
    const ctx = mock({ input: rejectedUpdate });
    assert.equal(await runP15d(['updates', '--input', 'input'], ctx.io), 1);
    assert.match(ctx.output.join(''), /STATE/);
  });
  it('dispatches attribution gate on the live CLI', async () => {
    const ctx = mock({ input: { schemaVersion: 1, asOf: '2026-11-15', assets: [], notices: [] } });
    assert.equal(await runP15d(['credits', '--input', 'input'], ctx.io), 0);
    assert.match(ctx.output.join(''), /"sources": 0/);
  });
  it('outputs French human-readable audit findings', async () => {
    const ctx = mock({ input: rejectedCatalog });
    assert.equal(await runP15d(['locales', '--input', 'input', '--format', 'fr'], ctx.io), 1);
    assert.match(ctx.output.join(''), /Exportation bloquée/);
  });
  it('outputs English human-readable audit findings', async () => {
    const ctx = mock({ input: rejectedCatalog });
    assert.equal(await runP15d(['locales', '--input', 'input', '--format', 'en'], ctx.io), 1);
    assert.match(ctx.output.join(''), /Export blocked/);
  });
  it('saves and emits a local report when requested', async () => {
    const ctx = mock({ input: rejectedCatalog });
    assert.equal(await runP15d(['locales', '--input', 'input', '--output', 'report'], ctx.io), 1);
    assert.equal(ctx.saved.get('report'), ctx.output.join(''));
  });
  it('returns 2 on invalid JSON', async () => {
    const ctx = mock({ input: '{bad-json' });
    assert.equal(await runP15d(['locales', '--input', 'input'], ctx.io), 2);
    assert.ok(ctx.errors.length > 0);
  });
  it('returns 2 when the input is absent', async () => {
    const ctx = mock({});
    assert.equal(await runP15d(['evidence', '--input', 'missing'], ctx.io), 2);
  });
  it('returns 2 on oversized input', async () => {
    const ctx = mock({ input: ' '.repeat(8 * 1024 * 1024 + 1) });
    assert.equal(await runP15d(['updates', '--input', 'input'], ctx.io), 2);
  });
  it('returns 2 when a report cannot be written', async () => {
    const ctx = mock({ input: rejectedCatalog });
    await ctx.io.save('report', 'existing');
    assert.equal(await runP15d(['locales', '--input', 'input', '--output', 'report'], ctx.io), 2);
  });
  it('retains P15D --help support for the new commands', async () => {
    const ctx = mock({});
    assert.equal(await runP15d(['--help'], ctx.io), 0);
    assert.match(ctx.output.join(''), /evidence --input/);
    assert.match(ctx.output.join(''), /locales --input/);
    assert.match(ctx.output.join(''), /updates --input/);
  });
  it('fails invalid options without reading any files', async () => {
    const ctx = mock({});
    assert.equal(await runP15e(['evidence', '--unknown', 'x'], ctx.io), 2);
    assert.match(ctx.errors.join(''), /Invalid or repeated option/);
  });
});
