import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { HELP, parse, run, type IO } from './p15j-cli.js';

function mock(input: Record<string, unknown> = {}): { io: IO; out: string[]; err: string[]; saved: Map<string, string> } {
  const out: string[] = [];
  const err: string[] = [];
  const saved = new Map<string, string>();
  const io: IO = {
    read: async path => {
      if (!Object.hasOwn(input, path)) throw new Error('Missing local input');
      const value = input[path];
      return typeof value === 'string' ? value : JSON.stringify(value);
    },
    write: async (path, content) => {
      if (saved.has(path)) throw new Error('Output already exists');
      saved.set(path, content);
    },
    out: content => { out.push(content); },
    err: content => { err.push(content); },
  };
  return { io, out, err, saved };
}
const emptyCoverage = { schemaVersion: 1, asOf: '2026-11-20', maxAgeDays: 30,
  sources: [], points: [], regions: [] };
const emptyHandoff = { schemaVersion: 1, asOf: '2026-11-20', maxAgeDays: 30,
  sources: [], records: [], packets: [], receipts: [] };
const emptyResume = { schemaVersion: 1, asOf: '2026-11-20', maxAgeDays: 30,
  availableBytes: 100, items: [], entries: [] };

describe('P15J CLI wired into local release audits', () => {
  it('prints command usage without reading any input', async () => {
    const ctx = mock();
    assert.equal(await run(['--help'], ctx.io), 0);
    assert.equal(ctx.out.join(''), HELP);
  });
  it('parses a handoff request', () => {
    assert.deepEqual(parse(['handoff', '--input', 'h.json']), {
      command: 'handoff', input: 'h.json', format: 'json',
    });
  });
  it('parses a resume request', () => {
    assert.deepEqual(parse(['resume', '--input', 'r.json']), {
      command: 'resume', input: 'r.json', format: 'json',
    });
  });
  it('parses a coverage request', () => {
    assert.deepEqual(parse(['coverage', '--input', 'c.json']), {
      command: 'coverage', input: 'c.json', format: 'json',
    });
  });
  it('parses a French text output request', () => {
    assert.deepEqual(parse(['coverage', '--input', 'c.json', '--format', 'fr']), {
      command: 'coverage', input: 'c.json', format: 'fr',
    });
  });
  it('parses an output file request', () => {
    assert.deepEqual(parse(['coverage', '--input', 'c.json', '--output', 'report.json']), {
      command: 'coverage', input: 'c.json', format: 'json', output: 'report.json',
    });
  });
  it('rejects missing subcommand', () => {
    assert.throws(() => parse([]), /Unknown command/);
  });
  it('rejects unsupported subcommands', () => {
    assert.throws(() => parse(['send', '--input', 'h.json']), /Unknown command/);
  });
  it('rejects an incomplete option pair', () => {
    assert.throws(() => parse(['handoff', '--input']), /Expected option/);
  });
  it('rejects a missing input option', () => {
    assert.throws(() => parse(['handoff']), /Missing --input/);
  });
  it('rejects duplicate input options', () => {
    assert.throws(() => parse(['resume', '--input', 'a', '--input', 'b']), /Unexpected/);
  });
  it('rejects unknown option names', () => {
    assert.throws(() => parse(['resume', '--source', 'a']), /Unexpected/);
  });
  it('rejects a missing flag value', () => {
    assert.throws(() => parse(['resume', '--input', 'a', '--format']), /Expected option/);
  });
  it('rejects unsupported output formats', () => {
    assert.throws(() => parse(['resume', '--input', 'a', '--format', 'xml']), /Invalid format/);
  });
  it('rejects writing output to the input path', () => {
    assert.throws(() => parse(['resume', '--input', 'a', '--output', 'a']), /differ/);
  });
  it('rejects input and output resolved to the same path', () => {
    assert.throws(() => parse(['resume', '--input', 'a', '--output', './a']), /differ/);
  });
  it('runs a complete handoff audit', async () => {
    const ctx = mock({ h: emptyHandoff });
    assert.equal(await run(['handoff', '--input', 'h'], ctx.io), 0);
    assert.match(ctx.out.join(''), /"packets": 0/);
  });
  it('runs a complete journal audit', async () => {
    const ctx = mock({ r: emptyResume });
    assert.equal(await run(['resume', '--input', 'r'], ctx.io), 0);
    assert.match(ctx.out.join(''), /"events": 0/);
  });
  it('runs a complete coverage audit', async () => {
    const ctx = mock({ c: emptyCoverage });
    assert.equal(await run(['coverage', '--input', 'c'], ctx.io), 0);
    assert.match(ctx.out.join(''), /"regionPairs": 0/);
  });
  it('returns 1 when a handoff is blocked', async () => {
    const ctx = mock({ h: { ...emptyHandoff, schemaVersion: 2 } });
    assert.equal(await run(['handoff', '--input', 'h'], ctx.io), 1);
    assert.match(ctx.out.join(''), /ROOT/);
  });
  it('returns 1 when an offline journal is blocked', async () => {
    const ctx = mock({ r: { ...emptyResume, availableBytes: -1 } });
    assert.equal(await run(['resume', '--input', 'r'], ctx.io), 1);
    assert.match(ctx.out.join(''), /POLICY/);
  });
  it('returns 1 when bilingual coverage is blocked', async () => {
    const ctx = mock({ c: { ...emptyCoverage, asOf: 'invalid' } });
    assert.equal(await run(['coverage', '--input', 'c'], ctx.io), 1);
    assert.match(ctx.out.join(''), /POLICY/);
  });
  it('renders a French blocked report', async () => {
    const ctx = mock({ c: { ...emptyCoverage, schemaVersion: 2 } });
    assert.equal(await run(['coverage', '--input', 'c', '--format', 'fr'], ctx.io), 1);
    assert.match(ctx.out.join(''), /Publication bloquée/);
  });
  it('renders an English blocked report', async () => {
    const ctx = mock({ c: { ...emptyCoverage, schemaVersion: 2 } });
    assert.equal(await run(['coverage', '--input', 'c', '--format', 'en'], ctx.io), 1);
    assert.match(ctx.out.join(''), /Publication blocked/);
  });
  it('renders a French passing report', async () => {
    const ctx = mock({ c: emptyCoverage });
    assert.equal(await run(['coverage', '--input', 'c', '--format', 'fr'], ctx.io), 0);
    assert.match(ctx.out.join(''), /Contrôle réussi/);
  });
  it('writes reports through the injected local I/O layer', async () => {
    const ctx = mock({ c: emptyCoverage });
    assert.equal(await run(['coverage', '--input', 'c', '--output', 'report'], ctx.io), 0);
    assert.equal(ctx.saved.get('report'), ctx.out.join(''));
  });
  it('does not overwrite a report that already exists', async () => {
    const ctx = mock({ c: emptyCoverage });
    const args = ['coverage', '--input', 'c', '--output', 'report'];
    assert.equal(await run(args, ctx.io), 0);
    assert.equal(await run(args, ctx.io), 2);
    assert.match(ctx.err.join(''), /already exists/);
  });
  it('returns 2 for missing input files', async () => {
    const ctx = mock();
    assert.equal(await run(['handoff', '--input', 'missing'], ctx.io), 2);
    assert.match(ctx.err.join(''), /Missing local input/);
  });
  it('returns 2 for broken JSON', async () => {
    const ctx = mock({ r: '{broken' });
    assert.equal(await run(['resume', '--input', 'r'], ctx.io), 2);
    assert.ok(ctx.err.length > 0);
  });
  it('returns 2 for input larger than 8 MiB', async () => {
    const ctx = mock({ c: ' '.repeat(8 * 1024 * 1024 + 1) });
    assert.equal(await run(['coverage', '--input', 'c'], ctx.io), 2);
    assert.match(ctx.err.join(''), /8 MiB/);
  });
  it('rejects invalid options before reading data', async () => {
    const ctx = mock();
    assert.equal(await run(['handoff', '--foo', 'bar'], ctx.io), 2);
    assert.match(ctx.err.join(''), /Unexpected option/);
  });
  it('does not output a passing report on malformed JSON', async () => {
    const ctx = mock({ c: '{bad' });
    assert.equal(await run(['coverage', '--input', 'c'], ctx.io), 2);
    assert.equal(ctx.out.length, 0);
  });
  it('does not save a report for an unreadable input', async () => {
    const ctx = mock();
    assert.equal(await run(['coverage', '--input', 'missing', '--output', 'report'], ctx.io), 2);
    assert.equal(ctx.saved.size, 0);
  });
  it('emits deterministic JSON audit results', async () => {
    const first = mock({ c: emptyCoverage });
    const second = mock({ c: emptyCoverage });
    assert.equal(await run(['coverage', '--input', 'c'], first.io), 0);
    assert.equal(await run(['coverage', '--input', 'c'], second.io), 0);
    assert.equal(first.out.join(''), second.out.join(''));
  });
});
