import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseLocaleQaArgs, executeLocaleQaCli, isCliEntrypoint, USAGE, LocaleQaCliError } from './locale-qa-cli.mjs';
import { fixtureRelease, withSource, withNotice } from './locale-qa-fixtures.mjs';

const executable = fileURLToPath(new URL('./locale-qa-cli.mjs', import.meta.url));
async function temporary(callback) {
  const directory = await mkdtemp(join(tmpdir(), 'locale-qa-'));
  try { return await callback(directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
}
async function save(directory, name, input) {
  const path = join(directory, name);
  await writeFile(path, JSON.stringify(input), 'utf8');
  return path;
}
function processCli(args) {
  return spawnSync(process.execPath, [executable, ...args], { encoding: 'utf8', timeout: 12000 });
}

test('usage documents the local JSON input', () => {
  assert.match(USAGE, /release\.json/u);
  assert.match(USAGE, /--lang en\|fr/u);
  assert.match(USAGE, /--before/u);
});
test('one positional argument uses safe defaults', () => {
  assert.deepEqual(parseLocaleQaArgs(['release.json']), { input: 'release.json', before: null, locale: 'en', format: 'text' });
});
test('locale and format options are independent of argument order', () => {
  assert.deepEqual(parseLocaleQaArgs(['--format', 'json', 'record.json', '--lang', 'fr']), {
    input: 'record.json', before: null, locale: 'fr', format: 'json',
  });
});
test('baseline file is optional and explicit', () => {
  assert.equal(parseLocaleQaArgs(['current.json', '--before', 'older.json']).before, 'older.json');
});
test('missing release path is rejected', () => {
  assert.throws(() => parseLocaleQaArgs([]), LocaleQaCliError);
  assert.throws(() => parseLocaleQaArgs(['--lang', 'fr']), LocaleQaCliError);
});
test('an unsupported option is rejected', () => {
  for (const option of ['--network', '--output', '--send', '--watch', '-v']) {
    assert.throws(() => parseLocaleQaArgs(['release.json', option]), LocaleQaCliError);
  }
});
test('repeated positional file paths are rejected', () => {
  assert.throws(() => parseLocaleQaArgs(['first.json', 'second.json']), LocaleQaCliError);
});
test('repeated options are rejected rather than silently overridden', () => {
  for (const args of [
    ['--lang', 'en', '--lang', 'fr'],
    ['--format', 'json', '--format', 'text'],
    ['--before', 'a.json', '--before', 'b.json'],
  ]) assert.throws(() => parseLocaleQaArgs(['release.json', ...args]), LocaleQaCliError);
});
test('missing option values are rejected', () => {
  for (const flag of ['--lang', '--format', '--before']) {
    assert.throws(() => parseLocaleQaArgs(['release.json', flag]), LocaleQaCliError);
  }
});
test('unknown language values are rejected', () => {
  for (const lang of ['FR', 'fr-CA', 'es', 'UNKNOWN', '']) {
    assert.throws(() => parseLocaleQaArgs(['release.json', '--lang', lang]), LocaleQaCliError);
  }
});
test('unknown report formats are rejected', () => {
  for (const format of ['pdf', 'csv', 'markdown', 'JSON', '']) {
    assert.throws(() => parseLocaleQaArgs(['release.json', '--format', format]), LocaleQaCliError);
  }
});
test('in-process CLI returns input error for absent paths', async () => {
  const result = await executeLocaleQaCli([]);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.ok(result.stderr.includes('Usage'));
});
test('a valid release returns success without touching external services', async () => {
  await temporary(async directory => {
    const path = await save(directory, 'valid.json', fixtureRelease());
    const result = await executeLocaleQaCli([path]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes('release-one'));
  });
});
test('a blocked release returns status 1 and explains permission loss', async () => {
  await temporary(async directory => {
    const path = await save(directory, 'blocked.json', withSource(fixtureRelease(), { permission: 'UNKNOWN' }));
    const result = await executeLocaleQaCli([path]);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('SOURCE_PERMISSION_MISSING'));
  });
});
test('invalid JSON returns status 2 rather than an uncaught exception', async () => {
  await temporary(async directory => {
    const path = join(directory, 'invalid.json');
    await writeFile(path, '{invalid', 'utf8');
    const result = await executeLocaleQaCli([path]);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.ok(result.stderr.includes('Invalid JSON'));
  });
});
test('missing local files return status 2', async () => {
  await temporary(async directory => {
    const result = await executeLocaleQaCli([join(directory, 'absent.json')]);
    assert.equal(result.status, 2);
    assert.ok(result.stderr.length > 0);
  });
});
test('a directory instead of a release file returns status 2', async () => {
  await temporary(async directory => {
    const result = await executeLocaleQaCli([directory]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /regular local file/u);
  });
});
test('French plain-text CLI returns translated labels', async () => {
  await temporary(async directory => {
    const path = await save(directory, 'valid.json', fixtureRelease());
    const result = await executeLocaleQaCli([path, '--lang', 'fr']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Données en date du\u00a0: UNKNOWN/u);
  });
});
test('standalone HTML CLI sets the requested language', async () => {
  await temporary(async directory => {
    const path = await save(directory, 'valid.json', fixtureRelease());
    const result = await executeLocaleQaCli([path, '--lang', 'fr', '--format', 'html']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /<html lang="fr">/u);
    assert.match(result.stdout, /connect-src /u);
  });
});
test('JSON CLI exposes structured release findings', async () => {
  await temporary(async directory => {
    const path = await save(directory, 'valid.json', fixtureRelease());
    const result = await executeLocaleQaCli([path, '--format', 'json']);
    assert.equal(result.status, 0);
    const data = JSON.parse(result.stdout);
    assert.equal(data.schema, 'attribution-locale-qa-report/1');
    assert.equal(data.audit.pageCount, 2);
  });
});
test('baseline comparison reports a removed notice', async () => {
  await temporary(async directory => {
    const current = withPageNoticeRemoved();
    const after = await save(directory, 'after.json', current);
    const before = await save(directory, 'before.json', fixtureRelease());
    const result = await executeLocaleQaCli([after, '--before', before, '--format', 'json']);
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.ok(report.comparison.changes.some(c => c.kind === 'notice-removed'));
  });
});
function withPageNoticeRemoved() {
  const value = fixtureRelease();
  value.pages[0].notices.pop();
  return value;
}
test('loss of a visible credit blocks even if the permission stays YES', async () => {
  await temporary(async directory => {
    const value = withNotice(fixtureRelease(), 'page-en', 'osm-credit', { visible: 'NO' });
    const path = await save(directory, 'hidden.json', value);
    const result = await executeLocaleQaCli([path]);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('NOTICE_HIDDEN_OR_UNKNOWN'));
  });
});
test('CLI does not write reports or mutate release input files', async () => {
  await temporary(async directory => {
    const path = await save(directory, 'record.json', fixtureRelease());
    const original = await readFile(path, 'utf8');
    await executeLocaleQaCli([path, '--format', 'html']);
    assert.equal(await readFile(path, 'utf8'), original);
    assert.deepEqual(await readdir(directory), ['record.json']);
  });
});
test('importing the CLI module does not run the entry point', () => {
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(new URL('./locale-qa-cli.mjs', import.meta.url).href)})`], {
    encoding: 'utf8', timeout: 12000,
  });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, '');
  assert.equal(child.stderr, '');
});
test('entry-point detection accepts the actual module path', () => {
  assert.equal(isCliEntrypoint(executable), true);
  assert.equal(isCliEntrypoint(join(dirname(executable), 'another-script.mjs')), false);
});
test('CLI executable process returns 0 for a valid release', async () => {
  await temporary(async directory => {
    const path = await save(directory, 'valid.json', fixtureRelease());
    const child = processCli([path]);
    assert.equal(child.status, 0, child.stderr);
    assert.ok(child.stdout.includes('release-one'));
    assert.equal(child.stderr, '');
  });
});
test('CLI executable process returns 1 for blocked release', async () => {
  await temporary(async directory => {
    const path = await save(directory, 'blocked.json', withSource(fixtureRelease(), { permission: 'NO' }));
    const child = processCli([path]);
    assert.equal(child.status, 1);
    assert.ok(child.stdout.includes('SOURCE_PERMISSION_MISSING'));
  });
});
test('CLI executable process returns 2 for missing file', () => {
  const child = processCli(['missing-locale-release.json']);
  assert.equal(child.status, 2);
  assert.ok(child.stderr.length > 0);
});
test('CLI executable process returns 2 for invalid arguments', () => {
  const child = processCli(['--format', 'pdf']);
  assert.equal(child.status, 2);
  assert.ok(child.stderr.length > 0);
});
test('CLI executable process produces proper French JSON report', async () => {
  await temporary(async directory => {
    const path = await save(directory, 'valid.json', fixtureRelease());
    const child = processCli([path, '--lang', 'fr', '--format', 'json']);
    assert.equal(child.status, 0, child.stderr);
    assert.equal(JSON.parse(child.stdout).blocked, false);
  });
});
