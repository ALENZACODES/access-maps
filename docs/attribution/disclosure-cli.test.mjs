import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseDisclosureArguments, runDisclosureGate,
} from './disclosure-cli.mjs';
import { emptyInventory } from './provenance-core.mjs';
import { emptyRegister } from './disclosure-core.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const cli = join(directory, 'disclosure-cli.mjs');

function capture(files, contents) {
  const output = [];
  const errors = [];
  return runDisclosureGate(files, {
    read: async (path) => contents[path],
    write: (text) => output.push(text),
    error: (text) => errors.push(text),
  }).then((code) => ({ code, output: output.join(''), errors: errors.join('') }));
}

describe('publication command line argument parsing', () => {
  it('requires exactly one or two JSON files', () => {
    assert.throws(() => parseDisclosureArguments([]), /Supply/u);
    assert.throws(() => parseDisclosureArguments(['a', 'b', 'c']), /Supply/u);
    assert.equal(parseDisclosureArguments(['a']).files.length, 1);
    assert.equal(parseDisclosureArguments(['a', 'b']).files.length, 2);
  });
  it('accepts explicit reference date', () => {
    const parsed = parseDisclosureArguments(['a.json', '--date', '2026-11-15']);
    assert.equal(parsed.referenceDate, '2026-11-15');
  });
  it('accepts only valid calendar dates', () => {
    for (const date of ['2026-02-30', '2026-13-01', 'today', 'UNKNOWN']) {
      assert.throws(() => parseDisclosureArguments(['a', '--date', date]), /Expected/u);
    }
  });
  it('allows JSON output', () => {
    assert.equal(parseDisclosureArguments(['--json', 'a.json']).json, true);
  });
  it('rejects repeating JSON option', () => {
    assert.throws(() => parseDisclosureArguments(['--json', '--json', 'a']), /Repeated/u);
  });
  it('rejects repeating date option', () => {
    assert.throws(() => parseDisclosureArguments(['a', '--date', '2026-11-15', '--date', '2026-11-16']), /Repeated/u);
  });
  it('rejects unknown options', () => {
    assert.throws(() => parseDisclosureArguments(['--help', 'a']), /Unexpected option/u);
  });
  it('does not accept empty paths', () => {
    assert.throws(() => parseDisclosureArguments([' ']), /Unexpected option/u);
  });
  it('defaults to UNKNOWN instead of system date', () => {
    assert.equal(parseDisclosureArguments(['a']).referenceDate, 'UNKNOWN');
  });
});

describe('release gate API and command line', () => {
  it('exits 1 for a valid but blocked combined release', async () => {
    const raw = JSON.stringify({ inventory: emptyInventory(), register: emptyRegister() });
    const result = await capture(['bundle.json'], { 'bundle.json': raw });
    assert.equal(result.code, 1);
    assert.match(result.output, /EMPTY_SURFACES/u);
    assert.equal(result.errors, '');
  });
  it('exits 2 when the package is invalid', async () => {
    const result = await capture(['bundle.json'], { 'bundle.json': '{' });
    assert.equal(result.code, 2);
    assert.match(result.errors, /input error/u);
    assert.equal(result.output, '');
  });
  it('exits 2 for missing files', async () => {
    const result = await runDisclosureGate([],
      { write: () => { throw new Error('Unexpected output'); }, error: () => {} });
    assert.equal(result, 2);
  });
  it('exits 1 with two separate documents when both are empty', async () => {
    const result = await capture(['inventory.json', 'register.json'], {
      'inventory.json': JSON.stringify(emptyInventory()),
      'register.json': JSON.stringify(emptyRegister()),
    });
    assert.equal(result.code, 1);
  });
  it('returns JSON with code and count details', async () => {
    const result = await capture(['--json', 'package.json'], {
      'package.json': JSON.stringify({ inventory: emptyInventory(), register: emptyRegister() }),
    });
    const json = JSON.parse(result.output);
    assert.equal(result.code, 1);
    assert.equal(json.passed, false);
    assert.ok(json.findings.some((finding) => finding.code === 'EMPTY_SURFACES'));
  });
  it('exits 2 when a separate file fails to parse', async () => {
    const result = await capture(['inventory.json', 'register.json'], {
      'inventory.json': JSON.stringify(emptyInventory()),
      'register.json': '{',
    });
    assert.equal(result.code, 2);
  });
  it('does not swallow errors from the source audit', async () => {
    const result = await capture(['bundle.json'], {
      'bundle.json': JSON.stringify({ inventory: { version: 55, records: [] }, register: emptyRegister() }),
    });
    assert.equal(result.code, 2);
  });
  it('is a loadable entry point without running the CLI on import', () => {
    const output = execFileSync(process.execPath,
      ['--input-type=module', '-e', `import '${join(directory, 'disclosure-cli.mjs')}';`],
      { encoding: 'utf8' });
    assert.equal(output, '');
  });
  it('returns a nonzero exit code as a spawned process on a held release', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'publication-gate-'));
    try {
      const path = join(folder, 'bundle.json');
      await writeFile(path, JSON.stringify({ inventory: emptyInventory(), register: emptyRegister() }));
      const outcome = spawnSync(process.execPath, [cli, path, '--json'], { encoding: 'utf8' });
      assert.equal(outcome.status, 1);
      assert.equal(JSON.parse(outcome.stdout).passed, false);
      assert.equal(outcome.stderr, '');
    } finally { await rm(folder, { recursive: true, force: true }); }
  });
  it('returns exit code 2 on malformed JSON from the actual executable', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'publication-error-'));
    try {
      const path = join(folder, 'broken.json');
      await writeFile(path, '{{{{');
      const outcome = spawnSync(process.execPath, [cli, path], { encoding: 'utf8' });
      assert.equal(outcome.status, 2);
      assert.match(outcome.stderr, /input error/u);
    } finally { await rm(folder, { recursive: true, force: true }); }
  });
});
