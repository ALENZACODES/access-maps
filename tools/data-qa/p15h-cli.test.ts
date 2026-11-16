import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runRegression, type RegressionIo } from './p15h-cli.js';
const snapshot = { schemaVersion: 1, asOf: '2026-11-15', maxAgeDays: 30,
  sources: [], places: [], assets: [] };
function harness(files: Record<string, unknown>) {
  const out: string[] = []; const err: string[] = [];
  const saved = new Map<string, string>();
  const io: RegressionIo = {
    read: async path => {
      if (!Object.hasOwn(files, path)) throw new Error('Missing file');
      const item = files[path];
      return typeof item === 'string' ? item : JSON.stringify(item);
    },
    write: async (path, text) => { if (saved.has(path)) throw new Error('Exists'); saved.set(path, text); },
    out: text => { out.push(text); }, err: text => { err.push(text); },
  };
  return { io, out, err, saved };
}
describe('P15H command integration', () => {
  it('prints help', async () => {
    const h = harness({}); assert.equal(await runRegression(['--help'], h.io), 0);
    assert.match(h.out.join(''), /--before/);
  });
  it('rejects an unknown command option', async () => {
    const h = harness({}); assert.equal(await runRegression(['--secret', 'x'], h.io), 2);
  });
  it('rejects repeated flags', async () => {
    const h = harness({}); assert.equal(await runRegression(['--before', 'a', '--before', 'b'], h.io), 2);
  });
  it('rejects missing flags', async () => {
    const h = harness({}); assert.equal(await runRegression(['--before', 'a'], h.io), 2);
  });
  it('rejects identical paths', async () => {
    const h = harness({}); assert.equal(await runRegression(['--before', 'a', '--after', 'a'], h.io), 2);
  });
  it('rejects malformed JSON', async () => {
    const h = harness({ a: '{', b: snapshot });
    assert.equal(await runRegression(['--before', 'a', '--after', 'b'], h.io), 2);
  });
  it('checks valid unchanged packages', async () => {
    const h = harness({ a: snapshot, b: snapshot });
    assert.equal(await runRegression(['--before', 'a', '--after', 'b'], h.io), 0);
    assert.match(h.out.join(''), /"ok": true/);
  });
  it('returns one when the release becomes invalid', async () => {
    const h = harness({ a: snapshot, b: {} });
    assert.equal(await runRegression(['--before', 'a', '--after', 'b'], h.io), 1);
    assert.match(h.out.join(''), /INPUT/);
  });
  it('renders French output', async () => {
    const h = harness({ a: snapshot, b: {} });
    assert.equal(await runRegression(['--before', 'a', '--after', 'b', '--format', 'fr'], h.io), 1);
    assert.match(h.out.join(''), /Publication bloquée/);
  });
  it('writes an output file once', async () => {
    const h = harness({ a: snapshot, b: snapshot });
    const args = ['--before', 'a', '--after', 'b', '--output', 'result.json'];
    assert.equal(await runRegression(args, h.io), 0);
    assert.equal(h.saved.get('result.json'), h.out.join(''));
    assert.equal(await runRegression(args, h.io), 2);
  });
  it('rejects missing input file', async () => {
    const h = harness({ a: snapshot });
    assert.equal(await runRegression(['--before', 'a', '--after', 'b'], h.io), 2);
  });
  it('rejects invalid output format', async () => {
    const h = harness({});
    assert.equal(await runRegression(['--before', 'a', '--after', 'b', '--format', 'xml'], h.io), 2);
  });
  it('rejects a report path that overwrites its input', async () => {
    const h = harness({});
    assert.equal(await runRegression(['--before', 'a', '--after', 'b', '--output', 'a'], h.io), 2);
  });
});
