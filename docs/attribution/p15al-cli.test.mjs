import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { RECEIPT_SCHEMA } from './p15al-receipts.mjs';
import { buildReview, toQueueCandidates } from './p15al-review.mjs';
import { notice, sampleInput, sampleRegistry, sampleSource } from './p15al-fixtures.mjs';

const cli = fileURLToPath(new URL('./p15al-cli.mjs', import.meta.url));

function invoke(args, data = '') {
  const result = spawnSync(process.execPath, [cli, ...args], {
    input: typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data),
    encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(result.error, undefined);
  return result;
}

async function directory(t) {
  const path = await mkdtemp(join(tmpdir(), 'offline-revalidation-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

test('plain stdin review output can be piped back into the command for identical candidate JSON', () => {
  const input = sampleInput({ captures: [notice(sampleSource(), 'withdrawn')] });
  const first = invoke([], input);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.stderr, '');
  const reported = JSON.parse(first.stdout);
  assert.deepEqual(reported, buildReview(input));
  const second = invoke(['--input', '-', '--format', 'candidates'], first.stdout);
  assert.equal(second.status, 0, second.stderr);
  assert.deepEqual(JSON.parse(second.stdout), toQueueCandidates(reported));
});

test('the registry entry point requires an explicit calendar policy and yields only permitted source metadata', async t => {
  const tmp = await directory(t);
  const path = join(tmp, 'registry.json');
  await writeFile(path, JSON.stringify({ sources: [sampleRegistry()] }));
  const result = invoke(['--registry', path, '--as-of', '2024-03-06', '--valid-days', '14',
    '--lead-days', '2', '--format', 'summary', '--lang', 'fr']);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('Jours avant l’échéance\u00a0: 1'));
  assert.ok(result.stdout.includes('Motifs du contrôle\u00a0: Contrôle à prévoir'));
  assert.ok(!result.stdout.includes('example.invalid'));
  const missing = invoke(['--registry', path, '--as-of', '2024-03-06']);
  assert.equal(missing.status, 2);
  assert.equal(missing.stdout, '');
});

test('separate local receipt import and previous-report comparison both work through the CLI', async t => {
  const tmp = await directory(t);
  const path = join(tmp, 'receipts.json');
  const previous = join(tmp, 'previous.json');
  const input = sampleInput();
  await writeFile(previous, JSON.stringify(buildReview(input)));
  const bundle = { schema: RECEIPT_SCHEMA, captures: [notice(sampleSource(), 'withdrawn')] };
  await writeFile(path, JSON.stringify(bundle));
  const work = invoke(['--receipts', path, '--previous', previous], input);
  assert.equal(work.status, 0, work.stderr);
  assert.deepEqual(JSON.parse(work.stdout).sources[0].opened, ['source-withdrawn']);
  const conflict = structuredClone(bundle.captures[0]);
  conflict.checkedOn = '2024-02-27';
  const failed = invoke(['--receipts', path], sampleInput({ captures: [conflict] }));
  assert.equal(failed.status, 1);
  assert.equal(failed.stdout, '');
  assert.match(failed.stderr, /repeated/u);
});

test('saved reports are replayed before allowing a new receipt to enter a tampered input', async t => {
  const tmp = await directory(t);
  const path = join(tmp, 'empty-batch.json');
  await writeFile(path, JSON.stringify({ schema: RECEIPT_SCHEMA, captures: [] }));
  const report = buildReview(sampleInput());
  report.records[0].sources[0].verificationTier = 4;
  const result = invoke(['--receipts', path, '--lang', 'fr'], report);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /recalcul/u);
});

test('file read and parse errors do not echo filenames, private JSON values or partial reports', () => {
  for (const [args, input] of [
    [['--input', '/no-file/private-filename', '--lang', 'fr'], ''],
    [['--lang', 'fr'], '{"private-filename":'],
    [['--lang', 'fr'], Buffer.from([0xc3, 0x28])],
  ]) {
    const result = invoke(args, input);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, 'Lecture du fichier JSON impossible.\n');
  }
});

test('argument validation prevents ambiguous input streams and ignored policy or output decisions', () => {
  for (const args of [
    ['--previous', '-'], ['--receipts', '-'], ['--format', 'table'],
    ['--input', '-', '--registry', '-'], ['--format', 'report', '--previous', 'old.json'],
    ['--lang', 'fr', '--lang', 'en'], ['--as-of', '2024-03-01'],
    ['--lang', 'unknown'], ['--help', '--input', '-'],
  ]) {
    const result = invoke(args, sampleInput());
    assert.equal(result.status, 2, args.join(' '));
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /--registry/u);
  }
});

test('help can be read offline in French without reading stdin or creating a report', () => {
  const result = invoke(['--lang', 'fr', '--help'], Buffer.from([0xff]));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Contrôle des sources hors ligne/u);
  assert.match(result.stdout, /--receipts/u);
  assert.doesNotMatch(result.stdout, /(?<!\u00a0):/u);
});
