import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, readFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {parseRightsArgs, executeRightsCli, RIGHTS_USAGE} from './rights-cli.mjs';
import {matrix, source, output} from './rights-fixtures.mjs';
const executable = fileURLToPath(new URL('./rights-cli.mjs', import.meta.url));
async function temp(run) {
  const directory = await mkdtemp(join(tmpdir(), 'rights-gate-'));
  try { return await run(directory); }
  finally { await rm(directory, {recursive: true, force: true}); }
}
async function writeMatrix(root, input = matrix(), filename = 'release.json') {
  const path = join(root, filename);
  await writeFile(path, JSON.stringify(input), 'utf8');
  return path;
}
async function executeWith(input, extra = []) {
  return temp(async dir => executeRightsCli([await writeMatrix(dir, input), ...extra]));
}
function spawn(...args) { return spawnSync(process.execPath, [executable, ...args], {encoding: 'utf8', timeout: 10000}); }

test('usage text describes the real .mjs entry point', () => {
  assert.ok(RIGHTS_USAGE.includes('rights-cli.mjs'));
  assert.ok(!RIGHTS_USAGE.includes('rights-cli.js'));
});
test('the CLI requires a current local matrix', () => assert.throws(() => parseRightsArgs([])));
test('the CLI accepts a single path with defaults', () => {
  assert.deepEqual(parseRightsArgs(['data.json']), {current: 'data.json', before: null, lang: 'en', format: 'text'});
});
test('the CLI accepts French and JSON format', () => {
  const args = parseRightsArgs(['data.json', '--lang', 'fr', '--format', 'json']);
  assert.equal(args.lang, 'fr');
  assert.equal(args.format, 'json');
});
test('the CLI accepts separate previous release path', () => {
  const args = parseRightsArgs(['current.json', '--before', 'old.json']);
  assert.equal(args.before, 'old.json');
});
test('the CLI accepts the option before positional input', () => {
  const args = parseRightsArgs(['--format', 'html', 'input.json']);
  assert.equal(args.format, 'html');
});
for (const argumentsList of [
  ['--help'], ['--bad', 'input.json'], ['input.json', '--bad'],
  ['input.json', 'second.json'], ['input.json', '--lang'],
  ['input.json', '--format'], ['input.json', '--before'],
  ['input.json', '--lang', '--format'], ['input.json', '--format', 'pdf'],
  ['input.json', '--lang', 'es'], ['input.json', '--lang', 'FR'],
  ['input.json', '--lang', 'fr', '--lang', 'en'],
  ['input.json', '--format', 'json', '--format', 'text'],
  ['input.json', '--before', 'a', '--before', 'b'],
]) {
  test(`invalid CLI arguments reject: ${argumentsList.join(' ')}`, () => {
    assert.throws(() => parseRightsArgs(argumentsList));
  });
}
test('a good local record produces status zero and English output', async () => {
  const result = await executeWith(matrix());
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('release-one'));
  assert.equal(result.stderr, '');
});
test('a denied permission returns blocked status one', async () => {
  const result = await executeWith(matrix({sources: [source({permission: 'NO'})]}));
  assert.equal(result.status, 1);
  assert.ok(result.stdout.includes('SOURCE_PERMISSION_MISSING'));
});
test('French CLI text includes nonbreaking space in field label', async () => {
  const result = await executeWith(matrix(), ['--lang', 'fr']);
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes('Données en date du\u00a0: UNKNOWN'));
});
test('CLI HTML output is self-contained and has no scripts', async () => {
  const result = await executeWith(matrix(), ['--format', 'html']);
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes('<html lang="en">'));
  assert.ok(!result.stdout.includes('<script'));
});
test('French CLI HTML has correct root language', async () => {
  const result = await executeWith(matrix(), ['--lang', 'fr', '--format', 'html']);
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes('<html lang="fr">'));
});
test('CLI JSON emits structured audit and original evidence', async () => {
  const result = await executeWith(matrix(), ['--format', 'json']);
  assert.equal(result.status, 0);
  const data = JSON.parse(result.stdout);
  assert.equal(data.schema, 'attribution-rights-report/1');
  assert.equal(data.matrix.sources[0].datasetAsOf, 'UNKNOWN');
  assert.equal(data.audit.blocked, false);
});
test('CLI before-release comparison reports licence regression', async () => {
  await temp(async dir => {
    const prior = await writeMatrix(dir, matrix(), 'old.json');
    const now = await writeMatrix(dir, matrix({sources: [source({licenceName: 'Changed licence'})]}), 'current.json');
    const result = await executeRightsCli([now, '--before', prior, '--format', 'json']);
    assert.equal(result.status, 1);
    const data = JSON.parse(result.stdout);
    assert.ok(data.comparison.changes.some(item => item.field === 'licenceName'));
  });
});
test('CLI allows an improvement without a new regression block', async () => {
  await temp(async dir => {
    const prior = await writeMatrix(dir, matrix({outputs: [output({minimumTargetPx: 44})]}), 'old.json');
    const now = await writeMatrix(dir, matrix({outputs: [output({minimumTargetPx: 64})]}), 'new.json');
    const result = await executeRightsCli([now, '--before', prior]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes('Changes since earlier release'));
  });
});
test('CLI refuses malformed JSON before audit', async () => {
  await temp(async dir => {
    const file = join(dir, 'broken.json');
    await writeFile(file, '{nope}', 'utf8');
    const result = await executeRightsCli([file]);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.ok(result.stderr.includes('Invalid JSON'));
  });
});
test('CLI refuses unsupported schema', async () => {
  const result = await executeWith({...matrix(), schema: 'other'});
  assert.equal(result.status, 2);
  assert.ok(result.stderr.includes('Unsupported schema'));
});
test('CLI rejects absent local file', async () => {
  const result = await executeRightsCli(['/tmp/nonexistent-rights-test-source.json']);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
});
test('CLI rejects a directory input', async () => {
  await temp(async dir => {
    const result = await executeRightsCli([dir]);
    assert.equal(result.status, 2);
    assert.ok(result.stderr);
  });
});
test('CLI cannot read input exceeding bounded size', async () => {
  await temp(async dir => {
    const file = join(dir, 'large.json');
    await writeFile(file, 'a'.repeat(2_097_153), 'utf8');
    const result = await executeRightsCli([file]);
    assert.equal(result.status, 2);
    assert.ok(result.stderr.includes('bounded'));
  });
});
test('CLI does not write a report file without request', async () => {
  await temp(async dir => {
    const file = await writeMatrix(dir);
    await executeRightsCli([file, '--format', 'html']);
    assert.deepEqual(await readdir(dir), ['release.json']);
  });
});
test('the executable can be imported without running itself', () => {
  const child = spawnSync(process.execPath, ['--input-type=module', '-e',
    `await import(${JSON.stringify(new URL('./rights-cli.mjs', import.meta.url).href)});`],
  {encoding: 'utf8', timeout: 10000});
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, '');
  assert.equal(child.stderr, '');
});
test('direct process invocation succeeds using the actual .mjs entry', async () => {
  await temp(async dir => {
    const file = await writeMatrix(dir);
    const child = spawn(file);
    assert.equal(child.status, 0, child.stderr);
    assert.ok(child.stdout.includes('release-one'));
    assert.equal(child.stderr, '');
  });
});
test('direct process invocation uses exit one for blocking record', async () => {
  await temp(async dir => {
    const file = await writeMatrix(dir, matrix({sources: [source({redistribution: 'NO'})]}));
    const child = spawn(file);
    assert.equal(child.status, 1, child.stderr);
    assert.ok(child.stdout.includes('SOURCE_REDISTRIBUTION_MISSING'));
  });
});
test('direct process invocation uses exit two for missing file', () => {
  const child = spawn('missing-rights-release.json');
  assert.equal(child.status, 2);
  assert.ok(child.stderr.length > 0);
});
test('direct process invocation offers JSON output', async () => {
  await temp(async dir => {
    const file = await writeMatrix(dir);
    const child = spawn(file, '--format', 'json');
    assert.equal(child.status, 0, child.stderr);
    assert.equal(JSON.parse(child.stdout).matrix.releaseId, 'release-one');
  });
});
test('direct process invocation offers French text output', async () => {
  await temp(async dir => {
    const file = await writeMatrix(dir);
    const child = spawn(file, '--lang', 'fr');
    assert.equal(child.status, 0, child.stderr);
    assert.ok(child.stdout.includes('Version\u00a0: release-one'));
  });
});
test('CLI module import URL points at a real source file', async () => {
  assert.ok(executable.endsWith('rights-cli.mjs'));
  const src = await readFile(executable, 'utf8');
  assert.ok(src.includes('executeRightsCli'));
});
