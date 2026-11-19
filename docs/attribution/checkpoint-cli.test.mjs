import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { executeCheckpointCli, parseCheckpointArgs } from './checkpoint-cli.mjs';
import { checkpointFixture, mutatedSource, mutatedSurface } from './checkpoint-fixtures.mjs';
const executable = fileURLToPath(new URL('./checkpoint-cli.mjs', import.meta.url));
async function sandbox(callback) {
  const root = await mkdtemp(join(tmpdir(), 'checkpoint-test-'));
  try { return await callback(root); } finally { await rm(root, { recursive: true, force: true }); }
}
async function file(root, input, name = 'record.json') {
  const path = join(root, name);
  await writeFile(path, JSON.stringify(input));
  return path;
}
test('parser accepts one document', () => assert.deepEqual(parseCheckpointArgs(['example.json']), { file: 'example.json', before: null, lang: 'en', format: 'text' }));
test('parser accepts independent locale, before and output format', () => {
  const args = parseCheckpointArgs(['current.json', '--format', 'html', '--before', 'old.json', '--lang', 'fr']);
  assert.deepEqual(args, { file: 'current.json', before: 'old.json', lang: 'fr', format: 'html' });
});
test('parser rejects missing input', () => assert.throws(() => parseCheckpointArgs([]), /Usage/));
test('parser rejects duplicate positional arguments', () => assert.throws(() => parseCheckpointArgs(['a.json', 'b.json']), /one current/));
test('parser rejects unsupported flags', () => {
  for (const flag of ['--send', '--write', '--watch', '-o']) assert.throws(() => parseCheckpointArgs(['a.json', flag]), /Unsupported argument/);
});
test('parser rejects repeated flags', () => assert.throws(() => parseCheckpointArgs(['a.json', '--lang', 'fr', '--lang', 'en']), /Repeated/));
test('parser rejects invalid locales and formats', () => {
  for (const lang of ['de', 'fr-CA', 'EN', '']) assert.throws(() => parseCheckpointArgs(['a.json', '--lang', lang]));
  for (const format of ['pdf', 'xml', 'yaml', '']) assert.throws(() => parseCheckpointArgs(['a.json', '--format', format]));
});
test('help without a manifest fails with status two', async () => {
  const outcome = await executeCheckpointCli(['--help']);
  assert.equal(outcome.status, 2);
  assert.equal(outcome.output, '');
});
test('valid release returns status zero', async () => sandbox(async root => {
  const input = await file(root, checkpointFixture());
  const result = await executeCheckpointCli([input]);
  assert.equal(result.status, 0, result.error);
  assert.ok(result.output.includes('sample-release'));
}));
test('incomplete evidence blocks with exit code one', async () => sandbox(async root => {
  const input = await file(root, mutatedSource({ permission: 'UNKNOWN' }));
  const result = await executeCheckpointCli([input]);
  assert.equal(result.status, 1, result.error);
  assert.ok(result.output.includes('PERMISSION_NOT_YES'));
}));
test('absent manifest returns status two', async () => sandbox(async root => {
  const result = await executeCheckpointCli([join(root, 'absent.json')]);
  assert.equal(result.status, 2);
  assert.ok(result.error.length > 0);
}));
test('malformed JSON returns status two', async () => sandbox(async root => {
  const input = join(root, 'bad.json');
  await writeFile(input, '{');
  const result = await executeCheckpointCli([input]);
  assert.equal(result.status, 2);
  assert.ok(result.error.includes('Invalid JSON'));
}));
test('French text has required nonbreaking spaces', async () => sandbox(async root => {
  const input = await file(root, checkpointFixture());
  const result = await executeCheckpointCli([input, '--lang', 'fr']);
  assert.equal(result.status, 0);
  assert.ok(result.output.includes('Données en date du\u00a0: UNKNOWN'));
}));
test('HTML format produces complete standalone report', async () => sandbox(async root => {
  const input = await file(root, checkpointFixture());
  const result = await executeCheckpointCli([input, '--lang', 'fr', '--format', 'html']);
  assert.equal(result.status, 0);
  assert.ok(result.output.includes('<html lang="fr">'));
  assert.ok(result.output.includes("connect-src 'none'"));
}));
test('JSON format is structured and retains UNKNOWN', async () => sandbox(async root => {
  const input = await file(root, checkpointFixture());
  const result = await executeCheckpointCli([input, '--format', 'json']);
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.output);
  assert.equal(parsed.schema, 'attribution-checkpoint-report/1');
  assert.equal(parsed.sources[0].datasetDate, 'UNKNOWN');
}));
test('comparison reports reduced control dimensions', async () => sandbox(async root => {
  const before = await file(root, checkpointFixture(), 'before.json');
  const after = await file(root, mutatedSurface({ targetPx: 43 }), 'after.json');
  const result = await executeCheckpointCli([after, '--before', before]);
  assert.equal(result.status, 1);
  assert.ok(result.output.includes('SURFACE_TARGETPX'));
}));
test('CLI does not save reports without an explicit shell redirection', async () => sandbox(async root => {
  const input = await file(root, checkpointFixture());
  const result = await executeCheckpointCli([input, '--format', 'html']);
  assert.equal(result.status, 0);
  assert.deepEqual(await readdir(root), ['record.json']);
}));
test('importing CLI module has no process side effects', () => {
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(new URL('./checkpoint-cli.mjs', import.meta.url).href)});`], { encoding: 'utf8', timeout: 10000 });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, '');
  assert.equal(child.stderr, '');
});
test('the actual source CLI can be executed without a compiled .js sibling', async () => sandbox(async root => {
  const input = await file(root, checkpointFixture());
  const child = spawnSync(process.execPath, [executable, input], { encoding: 'utf8', timeout: 10000 });
  assert.equal(child.status, 0, child.stderr);
  assert.ok(child.stdout.includes('sample-release'));
}));
test('CLI process returns one for blocking release', async () => sandbox(async root => {
  const input = await file(root, mutatedSource({ decision: 'held' }));
  const child = spawnSync(process.execPath, [executable, input], { encoding: 'utf8', timeout: 10000 });
  assert.equal(child.status, 1, child.stderr);
}));
test('CLI process returns two for missing file', () => {
  const child = spawnSync(process.execPath, [executable, 'missing-checkpoint.json'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(child.status, 2);
  assert.ok(child.stderr);
});
