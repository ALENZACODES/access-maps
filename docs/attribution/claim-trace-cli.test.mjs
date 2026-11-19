import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { executeClaimTraceCli, CLAIM_TRACE_USAGE } from './claim-trace-cli.mjs';
import { release, source, surface } from './claim-trace-fixture.test.mjs';
async function temporary(action) {
  const dir = await mkdtemp(join(tmpdir(), 'claim-trace-'));
  try { return await action(dir); } finally { await rm(dir, {recursive: true, force: true}); }
}
async function createFile(dir, document = release()) {
  const file = join(dir, 'trace.json');
  await writeFile(file, JSON.stringify(document), 'utf8');
  return file;
}
const executable = fileURLToPath(new URL('./claim-trace-cli.mjs', import.meta.url));
test('usage is explicit and describes input', () => assert.match(CLAIM_TRACE_USAGE, /release\.json/u));
test('CLI import performs no direct process exit', async () => {
  assert.equal((await executeClaimTraceCli([])).status, 2);
});
test('empty arguments have status two', async () => {
  const result = await executeClaimTraceCli([]);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
});
test('unexpected flag has status two', async () => {
  const result = await executeClaimTraceCli(['document.json', '--write']);
  assert.equal(result.status, 2);
});
test('repeated options fail closed', async () => {
  const result = await executeClaimTraceCli(['document.json', '--lang', 'fr', '--lang', 'en']);
  assert.equal(result.status, 2);
});
test('no unknown language fallback is used', async () => {
  const result = await executeClaimTraceCli(['document.json', '--lang', 'es']);
  assert.equal(result.status, 2);
});
test('unsupported output format fails', async () => {
  const result = await executeClaimTraceCli(['document.json', '--format', 'pdf']);
  assert.equal(result.status, 2);
});
test('missing manifest yields exit two', async () => {
  const result = await executeClaimTraceCli(['/missing/path/to/trace.json']);
  assert.equal(result.status, 2);
});
test('valid trace produces successful exit and text report', async () => {
  await temporary(async (dir) => {
    const file = await createFile(dir);
    const result = await executeClaimTraceCli([file]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes('claim-map'));
  });
});
test('blocking permission produces exit one', async () => {
  await temporary(async (dir) => {
    const file = await createFile(dir, release({sources: [source({permission: 'NO'})]}));
    const result = await executeClaimTraceCli([file]);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('SOURCE_PERMISSION_DENIED'));
  });
});
test('French output includes required colon spacing', async () => {
  await temporary(async (dir) => {
    const file = await createFile(dir);
    const result = await executeClaimTraceCli([file, '--lang', 'fr']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Données en date du\u00a0:/u);
  });
});
test('JSON format returns structured report', async () => {
  await temporary(async (dir) => {
    const file = await createFile(dir);
    const result = await executeClaimTraceCli([file, '--format', 'json']);
    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.trace.releaseId, 'release-one');
  });
});
test('HTML format has offline-only CSP', async () => {
  await temporary(async (dir) => {
    const file = await createFile(dir);
    const result = await executeClaimTraceCli([file, '--format', 'html', '--lang', 'fr']);
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('lang="fr"'));
    assert.ok(result.stdout.includes("connect-src &#39;none&#39;"));
  });
});
test('invalid JSON yields status two', async () => {
  await temporary(async (dir) => {
    const file = join(dir, 'invalid.json');
    await writeFile(file, '{invalid}', 'utf8');
    assert.equal((await executeClaimTraceCli([file])).status, 2);
  });
});
test('baseline report includes blocking regressions', async () => {
  await temporary(async (dir) => {
    const old = await createFile(dir);
    const newer = join(dir, 'new.json');
    await writeFile(newer, JSON.stringify(release({surfaces: [surface({targetPx: 40})]})));
    const result = await executeClaimTraceCli([newer, '--before', old]);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('targetPx'));
  });
});
test('process exits zero on valid manifest', async () => {
  await temporary(async (dir) => {
    const file = await createFile(dir);
    const child = spawnSync(process.execPath, [executable, file], {encoding: 'utf8', timeout: 10000});
    assert.equal(child.status, 0, child.stderr);
    assert.ok(child.stdout.includes('release-one'));
  });
});
test('process exits one on evidence blocker', async () => {
  await temporary(async (dir) => {
    const file = await createFile(dir, release({sources: [source({permission: 'NO'})]}));
    const child = spawnSync(process.execPath, [executable, file], {encoding: 'utf8', timeout: 10000});
    assert.equal(child.status, 1, child.stderr);
  });
});
test('process exits two for input error', () => {
  const child = spawnSync(process.execPath, [executable, '/definitely/missing.json'], {encoding: 'utf8', timeout: 10000});
  assert.equal(child.status, 2);
  assert.ok(child.stderr.length > 0);
});
test('importing CLI does not print or open a file', () => {
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(new URL('./claim-trace-cli.mjs', import.meta.url).href)})`], {encoding: 'utf8', timeout: 10000});
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, '');
  assert.equal(child.stderr, '');
});
test('CLI never saves a report without explicit user action', async () => {
  await temporary(async (dir) => {
    const file = await createFile(dir);
    const before = await readFile(file, 'utf8');
    await executeClaimTraceCli([file]);
    const after = await readFile(file, 'utf8');
    assert.equal(before, after);
  });
});
