import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runPublication } from './p15g-cli.js';

function mock(contents: string) {
  const outputs: string[] = [];
  const errors: string[] = [];
  const saved = new Map<string, string>();
  return {
    outputs, errors, saved,
    io: {
      load: async (_path: string): Promise<string> => contents,
      save: async (path: string, text: string): Promise<void> => {
        if (saved.has(path)) throw new Error('Already exists');
        saved.set(path, text);
      },
      out: (text: string) => { outputs.push(text); },
      err: (text: string) => { errors.push(text); },
    },
  };
}
const empty = { schemaVersion: 1, asOf: '2026-11-16', maxAgeDays: 365,
  sources: [], places: [], assets: [] };

describe('P15G local CLI', () => {
  it('shows help without reading input', async () => {
    const context = mock('');
    assert.equal(await runPublication(['--help'], context.io), 0);
    assert.match(context.outputs.join(''), /--input/);
  });
  it('rejects missing input path', async () => {
    const context = mock('');
    assert.equal(await runPublication([], context.io), 2);
  });
  it('rejects unknown options', async () => {
    const context = mock('');
    assert.equal(await runPublication(['--remote', 'https://example.org'], context.io), 2);
  });
  it('rejects repeated options', async () => {
    const context = mock('');
    assert.equal(await runPublication(['--input', 'a', '--input', 'b'], context.io), 2);
  });
  it('rejects an unsupported text format', async () => {
    const context = mock('');
    assert.equal(await runPublication(['--input', 'a', '--format', 'xml'], context.io), 2);
  });
  it('rejects identical input and output locations', async () => {
    const context = mock('');
    assert.equal(await runPublication(['--input', 'a', '--output', './a'], context.io), 2);
  });
  it('rejects invalid JSON', async () => {
    const context = mock('{ bad');
    assert.equal(await runPublication(['--input', 'file'], context.io), 2);
    assert.ok(context.errors.length > 0);
  });
  it('blocks oversized input', async () => {
    const context = mock(' '.repeat(8 * 1024 * 1024 + 1));
    assert.equal(await runPublication(['--input', 'file'], context.io), 2);
  });
  it('returns pass on valid input', async () => {
    const context = mock(JSON.stringify(empty));
    assert.equal(await runPublication(['--input', 'file'], context.io), 0);
    assert.match(context.outputs.join(''), /"ok": true/);
  });
  it('returns blocked on invalid metadata', async () => {
    const context = mock(JSON.stringify({ ...empty, asOf: 'no-date' }));
    assert.equal(await runPublication(['--input', 'file'], context.io), 1);
    assert.match(context.outputs.join(''), /DATE/);
  });
  it('renders English diagnostics', async () => {
    const context = mock(JSON.stringify({ ...empty, asOf: 'no-date' }));
    assert.equal(await runPublication(['--input', 'file', '--format', 'en'], context.io), 1);
    assert.match(context.outputs.join(''), /Export blocked/);
  });
  it('renders French diagnostics', async () => {
    const context = mock(JSON.stringify({ ...empty, asOf: 'no-date' }));
    assert.equal(await runPublication(['--input', 'file', '--format', 'fr'], context.io), 1);
    assert.match(context.outputs.join(''), /Exportation bloquée/);
  });
  it('saves one local report', async () => {
    const context = mock(JSON.stringify(empty));
    assert.equal(await runPublication(['--input', 'file', '--output', 'report'], context.io), 0);
    assert.equal(context.saved.get('report'), context.outputs.join(''));
  });
  it('does not overwrite an existing local report', async () => {
    const context = mock(JSON.stringify(empty));
    assert.equal(await runPublication(['--input', 'file', '--output', 'report'], context.io), 0);
    assert.equal(await runPublication(['--input', 'file', '--output', 'report'], context.io), 2);
  });
  it('returns invalid input when local reads fail', async () => {
    const context = mock('');
    const io = { ...context.io, load: async (_path: string): Promise<string> => { throw new Error('missing'); } };
    assert.equal(await runPublication(['--input', 'file'], io), 2);
  });
});
