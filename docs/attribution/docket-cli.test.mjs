import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DOCKET_USAGE, parseDocketArgs, executeDocketCli } from './docket-cli.mjs';
import { fixtureDocket, fixtureSource, fixtureSurface } from './docket-fixtures.mjs';

const entry = fileURLToPath(new URL('./docket-cli.mjs', import.meta.url));
async function inDir(callback) {
  const dir = await mkdtemp(join(tmpdir(), 'attribution-docket-'));
  try { return await callback(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}
async function save(dir, name, value) {
  const target = join(dir, name);
  await writeFile(target, typeof value === 'string' ? value : JSON.stringify(value), 'utf8');
  return target;
}
function runCli(args) {
  return spawnSync(process.execPath, [entry, ...args], { encoding: 'utf8', timeout: 10000 });
}
test('documented CLI usage names the actual mjs module', () => {
  assert.match(DOCKET_USAGE, /docket-cli\.mjs/u);
});
test('CLI accepts simple positional file', () => {
  assert.deepEqual(parseDocketArgs(['release.json']), {
    file: 'release.json', before: null, locale: 'en', format: 'text', asOf: null,
  });
});
test('CLI accepts options in any order', () => {
  assert.deepEqual(parseDocketArgs(['--lang', 'fr', 'release.json', '--format', 'json', '--as-of', '2026-11-19']), {
    file: 'release.json', before: null, locale: 'fr', format: 'json', asOf: '2026-11-19',
  });
});
test('CLI accepts baseline', () => {
  assert.equal(parseDocketArgs(['release.json', '--before', 'earlier.json']).before, 'earlier.json');
});
for (const args of [[], ['--help'], ['--format'], ['release.json', '--lang'],
  ['release.json', '--before'], ['release.json', '--as-of'],
  ['release.json', '--lang', 'es'], ['release.json', '--format', 'pdf'],
  ['release.json', '--format', 'HTML'], ['release.json', '--format', 'json', '--format', 'text'],
  ['release.json', 'another.json'], ['--unknown', 'release.json'],
  ['release.json', '--as-of', '2026-02-30']]) {
  test(`CLI rejects invalid options ${JSON.stringify(args)}`, () => {
    assert.throws(() => parseDocketArgs(args));
  });
}
test('empty arguments return status 2 without writing a report', async () => {
  const result = await executeDocketCli([]);
  assert.equal(result.status, 2);
  assert.equal(result.output, '');
  assert.ok(result.error.includes('Usage:'));
});
test('valid local docket returns status 0', async () => {
  await inDir(async (dir) => {
    const path = await save(dir, 'current.json', fixtureDocket());
    const result = await executeDocketCli([path]);
    assert.equal(result.status, 0, result.error);
    assert.match(result.output, /release-one/u);
    assert.equal(result.error, '');
  });
});
test('blocked local docket returns status 1', async () => {
  await inDir(async (dir) => {
    const path = await save(dir, 'blocked.json', fixtureDocket({ sources: [fixtureSource({ permission: 'UNKNOWN' })] }));
    const result = await executeDocketCli([path]);
    assert.equal(result.status, 1);
    assert.match(result.output, /PERMISSION_NOT_YES/u);
  });
});
test('missing local file returns status 2', async () => {
  await inDir(async (dir) => {
    const result = await executeDocketCli([join(dir, 'missing.json')]);
    assert.equal(result.status, 2);
    assert.ok(result.error.length > 0);
  });
});
test('malformed JSON returns status 2 without partial report', async () => {
  await inDir(async (dir) => {
    const path = await save(dir, 'bad.json', '{ not json');
    const result = await executeDocketCli([path]);
    assert.equal(result.status, 2);
    assert.equal(result.output, '');
  });
});
test('input above limit returns status 2', async () => {
  await inDir(async (dir) => {
    const path = await save(dir, 'large.json', 'a'.repeat(2_097_153));
    const result = await executeDocketCli([path]);
    assert.equal(result.status, 2);
  });
});
test('baseline comparison with no changes passes', async () => {
  await inDir(async (dir) => {
    const before = await save(dir, 'old.json', fixtureDocket());
    const after = await save(dir, 'new.json', fixtureDocket());
    const result = await executeDocketCli([after, '--before', before]);
    assert.equal(result.status, 0, result.error);
    assert.match(result.output, /Changes/u);
  });
});
test('baseline with lost source permission returns status 1', async () => {
  await inDir(async (dir) => {
    const before = await save(dir, 'old.json', fixtureDocket());
    const after = await save(dir, 'new.json', fixtureDocket({ sources: [fixtureSource({ permission: 'NO' })] }));
    const result = await executeDocketCli([after, '--before', before]);
    assert.equal(result.status, 1);
    assert.match(result.output, /Before=YES/u);
  });
});
test('CLI uses supplied --as-of date instead of system clock', async () => {
  await inDir(async (dir) => {
    const path = await save(dir, 'current.json', fixtureDocket());
    const result = await executeDocketCli([path, '--as-of', '2027-01-01']);
    assert.equal(result.status, 1);
    assert.match(result.output, /REVIEW_OVERDUE/u);
  });
});
test('CLI retains UNKNOWN when as-of is UNKNOWN', async () => {
  await inDir(async (dir) => {
    const path = await save(dir, 'unknown.json', fixtureDocket({ asOf: 'UNKNOWN' }));
    const result = await executeDocketCli([path]);
    assert.equal(result.status, 0);
    assert.match(result.output, /UNKNOWN/u);
  });
});
test('CLI French text report uses nonbreaking colon', async () => {
  await inDir(async (dir) => {
    const path = await save(dir, 'current.json', fixtureDocket());
    const result = await executeDocketCli([path, '--lang', 'fr']);
    assert.equal(result.status, 0);
    assert.ok(result.output.includes('Version\u00a0: release-one'));
  });
});
test('CLI French HTML report declares language', async () => {
  await inDir(async (dir) => {
    const path = await save(dir, 'current.json', fixtureDocket());
    const result = await executeDocketCli([path, '--lang', 'fr', '--format', 'html']);
    assert.equal(result.status, 0);
    assert.match(result.output, /<html lang="fr">/u);
  });
});
test('CLI JSON report has expected schema', async () => {
  await inDir(async (dir) => {
    const path = await save(dir, 'current.json', fixtureDocket());
    const result = await executeDocketCli([path, '--format', 'json']);
    assert.equal(result.status, 0);
    assert.equal(JSON.parse(result.output).schema, 'attribution-docket-report/1');
  });
});
test('importing CLI does not run process', () => {
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(new URL('./docket-cli.mjs', import.meta.url).href)});`], {
    encoding: 'utf8', timeout: 10000,
  });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, '');
  assert.equal(child.stderr, '');
});
test('process-level CLI valid input exits zero', async () => {
  await inDir(async (dir) => {
    const path = await save(dir, 'current.json', fixtureDocket());
    const child = runCli([path]);
    assert.equal(child.status, 0, child.stderr);
    assert.match(child.stdout, /release-one/u);
  });
});
test('process-level CLI blocker exits one', async () => {
  await inDir(async (dir) => {
    const path = await save(dir, 'current.json', fixtureDocket({ surfaces: [fixtureSurface({ targetPx: 30 })] }));
    const child = runCli([path]);
    assert.equal(child.status, 1, child.stderr);
    assert.match(child.stdout, /TARGET_TOO_SMALL/u);
  });
});
test('process-level CLI missing input exits two', () => {
  const child = runCli(['no-file.json']);
  assert.equal(child.status, 2);
  assert.ok(child.stderr.length > 0);
});
test('CLI leaves local directory unchanged', async () => {
  await inDir(async (dir) => {
    const path = await save(dir, 'current.json', fixtureDocket());
    await executeDocketCli([path, '--format', 'html']);
    assert.ok((await readFile(path, 'utf8')).includes('release-one'));
    const { readdir } = await import('node:fs/promises');
    assert.deepEqual(await readdir(dir), ['current.json']);
  });
});
