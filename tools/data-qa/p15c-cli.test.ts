import assert from 'node:assert/strict';
import { test } from 'node:test';
import { outputFor, parseCli, runCli } from './p15c-cli.ts';
import type { CliIo } from './p15c-cli.ts';
import type { AuditResult } from './p15c-pipeline.ts';

const good: AuditResult = {
  ok: true, schemaVersion: 1, asOf: '2026-11-15',
  issues: [], totals: { assets: 0, regions: 0, cellsPresent: 0, cellsUnknown: 0, bytesRead: 0 },
};
const bad: AuditResult = {
  ...good, ok: false,
  issues: [{ code: 'ASSET_HASH', severity: 'ERROR', path: '$.assets[0]',
    en: 'Asset SHA-256 does not match.', fr: 'L’empreinte SHA-256 du fichier ne correspond pas.' }],
};
const baseArgs = [
  'audit', '--root', '/tmp/example', '--manifest', 'manifest.json', '--as-of', '2026-11-15',
  '--max-age-days', '30',
];

test('CLI parses a complete deterministic audit request', () => {
  assert.deepEqual(parseCli(baseArgs), {
    options: { root: '/tmp/example', manifestPath: 'manifest.json', asOf: '2026-11-15', maxAgeDays: 30 },
    output: 'json',
  });
});

test('CLI supports optional per-file and aggregate byte caps', () => {
  const parsed = parseCli([...baseArgs, '--max-asset-bytes', '100', '--max-total-bytes', '500']);
  assert.notEqual(parsed, 'help');
  if (parsed === 'help') return;
  assert.equal(parsed.options.maxAssetBytes, 100);
  assert.equal(parsed.options.maxTotalBytes, 500);
});

test('CLI accepts both localized output formats', () => {
  for (const language of ['en', 'fr'] as const) {
    const request = parseCli([...baseArgs, '--format', language]);
    assert.notEqual(request, 'help');
    if (request === 'help') continue;
    assert.equal(request.output, language);
  }
});

test('CLI rejects incomplete, duplicate and unknown options', () => {
  const invalid = [
    [...baseArgs, '--root', 'other'],
    [...baseArgs, '--unknown', 'x'],
    [...baseArgs, '--format'],
    [...baseArgs, '--max-age-days', '-1'],
    [...baseArgs, '--max-asset-bytes', '0'],
    [...baseArgs, '--max-total-bytes', '1.5'],
    [...baseArgs, '--format', 'de'],
    ['audit', '--root', '/tmp/x'],
    [],
  ];
  for (const request of invalid) assert.throws(() => parseCli(request), undefined, JSON.stringify(request));
});

test('CLI print help and returns successful exit code', async () => {
  let output = '';
  let errors = '';
  const io: CliIo = {
    stdout: value => { output += value; },
    stderr: value => { errors += value; },
    audit: async () => { throw new Error('Must not audit'); },
    save: async () => { throw new Error('Must not save'); },
  };
  assert.equal(await runCli(['--help'], io), 0);
  assert.match(output, /--manifest PATH/);
  assert.equal(errors, '');
});

test('CLI uses output once and gives exit 1 for blocked export', async () => {
  const outputs: string[] = [];
  const io: CliIo = {
    stdout: value => outputs.push(value),
    stderr: () => { throw new Error('unexpected stderr'); },
    audit: async () => bad,
    save: async () => { throw new Error('unexpected save'); },
  };
  assert.equal(await runCli(baseArgs, io), 1);
  assert.equal(outputs.length, 1);
  assert.match(outputs[0]!, /ASSET_HASH/);
});

test('CLI writes the exact report when requested and returns 0', async () => {
  const written: Array<[string, string]> = [];
  const printed: string[] = [];
  const io: CliIo = {
    stdout: value => printed.push(value),
    stderr: () => { throw new Error('unexpected stderr'); },
    audit: async () => good,
    save: async (path, text) => { written.push([path, text]); },
  };
  const command = [...baseArgs, '--format', 'fr', '--report-file', 'report.txt'];
  assert.equal(await runCli(command, io), 0);
  assert.deepEqual(written, [['report.txt', printed[0]!]]);
  assert.match(printed[0]!, /RÉUSSI/);
});

test('CLI returns exit 2 on report I/O errors', async () => {
  const errors: string[] = [];
  const io: CliIo = {
    stdout: () => { throw new Error('unexpected stdout'); },
    stderr: value => errors.push(value),
    audit: async () => good,
    save: async () => { throw new Error('exists'); },
  };
  assert.equal(await runCli([...baseArgs, '--report-file', 'exists.txt'], io), 2);
  assert.match(errors.join(''), /Cannot write/);
});

test('CLI returns exit 2 on unexpected audit errors', async () => {
  const errors: string[] = [];
  const io: CliIo = {
    stdout: () => { throw new Error('unexpected stdout'); },
    stderr: value => errors.push(value),
    audit: async () => { throw new RangeError('bad date'); },
    save: async () => { throw new Error('unexpected save'); },
  };
  assert.equal(await runCli(baseArgs, io), 2);
  assert.match(errors.join(''), /bad date/);
});

test('CLI emits readable JSON and both languages', () => {
  assert.deepEqual(JSON.parse(outputFor(good, 'json')), good);
  assert.match(outputFor(bad, 'en'), /BLOCKED/);
  assert.match(outputFor(bad, 'fr'), /BLOQUÉ/);
  assert.doesNotMatch(outputFor(bad, 'fr'), /does not match/);
});
