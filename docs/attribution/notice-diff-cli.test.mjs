import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseNoticeCliArgs, executeNoticeCli, NOTICE_CLI_USAGE, NoticeCliError } from './notice-diff-cli.mjs';
import { release, mutateSource, mutateSurface } from './notice-diff-fixtures.mjs';
async function local(run) {
  const root = await mkdtemp(join(tmpdir(), 'notice-diff-'));
  try { return await run(root); }
  finally { await rm(root, { recursive: true, force: true }); }
}
async function save(root, name, data) {
  const path = join(root, name);
  await writeFile(path, typeof data === 'string' ? data : JSON.stringify(data), 'utf8');
  return path;
}
function processCall(args) {
  const executable = fileURLToPath(new URL('./notice-diff-cli.mjs', import.meta.url));
  return spawnSync(process.execPath, [executable, ...args], { encoding: 'utf8', timeout: 15000 });
}
test('CLI has documented usage', () => assert.match(NOTICE_CLI_USAGE, /notice-diff-cli\.mjs/u));
test('a normal input path is required', () => assert.throws(() => parseNoticeCliArgs([]), NoticeCliError));
test('a normal file uses default options', () => {
  assert.deepEqual(parseNoticeCliArgs(['release.json']), {
    current: 'release.json', before: null, lang: 'en', format: 'text', today: 'UNKNOWN',
    requirePairs: false, allowOnline: false,
  });
});
test('options work before the filename', () => {
  const result = parseNoticeCliArgs(['--lang', 'fr', '--format', 'json', 'release.json']);
  assert.equal(result.lang, 'fr');
  assert.equal(result.format, 'json');
});
test('all supported options can be combined', () => {
  const result = parseNoticeCliArgs(['file.json', '--before', 'old.json', '--today', '2026-01-20', '--require-pairs', '--allow-online', '--format', 'html']);
  assert.equal(result.before, 'old.json');
  assert.equal(result.today, '2026-01-20');
  assert.equal(result.requirePairs, true);
  assert.equal(result.allowOnline, true);
  assert.equal(result.format, 'html');
});
for (const bad of [
  ['file.json', 'another.json'], ['--lang', 'es', 'file.json'], ['file.json', '--format', 'pdf'],
  ['file.json', '--today', 'tomorrow'], ['file.json', '--no-such-option'],
  ['file.json', '--lang'], ['file.json', '--format'], ['file.json', '--before'],
  ['file.json', '--today'], ['file.json', '--lang', '--format', 'html'],
  ['file.json', '--allow-online', '--allow-online'], ['file.json', '--require-pairs', '--require-pairs'],
  ['file.json', '--lang', 'en', '--lang', 'fr'],
]) {
  test(`CLI rejects invalid option sequence ${bad.join(' ')}`, () => assert.throws(() => parseNoticeCliArgs(bad), NoticeCliError));
}
test('CLI returns input code for empty arguments', async () => {
  const result = await executeNoticeCli([]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Usage:/u);
  assert.equal(result.stdout, '');
});
test('CLI returns input code for a missing file', async () => {
  const result = await executeNoticeCli(['missing-release.json']);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
});
test('CLI returns input code for malformed JSON', async () => {
  await local(async root => {
    const path = await save(root, 'bad.json', '{not-json');
    const result = await executeNoticeCli([path]);
    assert.equal(result.status, 2);
    assert.ok(result.stderr.includes('Invalid JSON'));
  });
});
test('CLI returns input code for malformed release', async () => {
  await local(async root => {
    const path = await save(root, 'bad.json', { ...release(), schema: 'wrong-version' });
    const result = await executeNoticeCli([path]);
    assert.equal(result.status, 2);
    assert.ok(result.stderr.includes('Unsupported version'));
  });
});
test('CLI returns success for complete source notices', async () => {
  await local(async root => {
    const path = await save(root, 'complete.json', release());
    const result = await executeNoticeCli([path]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes('release-one'));
    assert.equal(result.stderr, '');
  });
});
test('CLI returns block for missing permission evidence', async () => {
  await local(async root => {
    const path = await save(root, 'held.json', mutateSource(release(), { permission: 'UNKNOWN' }));
    const result = await executeNoticeCli([path]);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('PERMISSION_UNKNOWN'));
  });
});
test('CLI returns block for undersized targets', async () => {
  await local(async root => {
    const path = await save(root, 'small.json', mutateSurface(release(), { targetPx: 30 }));
    const result = await executeNoticeCli([path]);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('TARGET_TOO_SMALL'));
  });
});
test('CLI supports JSON report output', async () => {
  await local(async root => {
    const path = await save(root, 'complete.json', release());
    const result = await executeNoticeCli([path, '--format', 'json']);
    assert.equal(result.status, 0);
    assert.equal(JSON.parse(result.stdout).schema, 'attribution-notice-report/1');
  });
});
test('CLI supports French text report', async () => {
  await local(async root => {
    const path = await save(root, 'complete.json', release());
    const result = await executeNoticeCli([path, '--lang', 'fr']);
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('Données en date du\u00a0:'));
  });
});
test('CLI supports HTML report without network dependencies', async () => {
  await local(async root => {
    const path = await save(root, 'complete.json', release());
    const result = await executeNoticeCli([path, '--format', 'html']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /<html lang="en">/u);
    assert.ok(result.stdout.includes("connect-src 'none'"));
  });
});
test('CLI compares against prior release explicitly', async () => {
  await local(async root => {
    const old = await save(root, 'old.json', release());
    const next = await save(root, 'new.json', mutateSource(release(), { permission: 'UNKNOWN' }));
    const result = await executeNoticeCli([next, '--before', old, '--format', 'json']);
    assert.equal(result.status, 1);
    assert.ok(JSON.parse(result.stdout).comparison.changes.length > 0);
  });
});
test('CLI recognizes explicitly requested date boundaries', async () => {
  await local(async root => {
    const path = await save(root, 'complete.json', release());
    const result = await executeNoticeCli([path, '--today', '2025-12-31']);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('DATE_FUTURE'));
  });
});
test('CLI offline opt-out affects only the offline requirement', async () => {
  await local(async root => {
    const path = await save(root, 'online.json', mutateSurface(release(), { offline: 'NO' }));
    assert.equal((await executeNoticeCli([path])).status, 1);
    assert.equal((await executeNoticeCli([path, '--allow-online'])).status, 0);
  });
});
test('CLI does not create any additional file by default', async () => {
  await local(async root => {
    const path = await save(root, 'complete.json', release());
    const { readdir } = await import('node:fs/promises');
    await executeNoticeCli([path, '--format', 'html']);
    assert.deepEqual(await readdir(root), ['complete.json']);
  });
});
test('the module is side-effect-free on import', () => {
  const command = 'import(' + JSON.stringify(new URL('./notice-diff-cli.mjs', import.meta.url).href) + ');';
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', command], { encoding: 'utf8', timeout: 15000 });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, '');
  assert.equal(child.stderr, '');
});
test('a valid child process exits zero', async () => {
  await local(async root => {
    const path = await save(root, 'complete.json', release());
    const child = processCall([path]);
    assert.equal(child.status, 0, child.stderr);
    assert.ok(child.stdout.includes('release-one'));
  });
});
test('a blocked child process exits one', async () => {
  await local(async root => {
    const path = await save(root, 'blocked.json', mutateSource(release(), { permission: 'NO' }));
    const child = processCall([path]);
    assert.equal(child.status, 1, child.stderr);
    assert.ok(child.stdout.includes('PERMISSION_NO'));
  });
});
test('a missing-file child process exits two', () => {
  const child = processCall(['missing-notice-diff-input.json']);
  assert.equal(child.status, 2);
  assert.ok(child.stderr.length > 0);
});
