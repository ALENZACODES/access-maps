import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ACCESS_REVIEW_USAGE, ReviewCliError, parseAccessReviewArgs,
  executeAccessReviewCli, isReviewCliEntrypoint,
} from './access-review-cli.mjs';
import { reviewRelease } from './access-review-fixtures.mjs';
import { UNKNOWN } from './access-review-core.mjs';
const executable = fileURLToPath(new URL('./access-review-cli.mjs', import.meta.url));

async function temporary(fn) {
  const root = await mkdtemp(join(tmpdir(), 'access-review-cli-'));
  try { return await fn(root); }
  finally { await rm(root, { recursive: true, force: true }); }
}
async function createFile(root, value = reviewRelease(), name = 'review.json') {
  const file = join(root, name);
  await writeFile(file, JSON.stringify(value), 'utf8');
  return file;
}
function runProcess(args) {
  return spawnSync(process.execPath, [executable, ...args], { encoding: 'utf8', timeout: 15000 });
}

test('usage documents all input and report modes', () => {
  assert.ok(ACCESS_REVIEW_USAGE.includes('release.json'));
  assert.ok(ACCESS_REVIEW_USAGE.includes('--before'));
  assert.ok(ACCESS_REVIEW_USAGE.includes('--format'));
  assert.ok(ACCESS_REVIEW_USAGE.includes('--require-paired'));
});
test('default parser arguments are explicit and unambiguous', () => {
  assert.deepEqual(parseAccessReviewArgs(['review.json']), {
    current: 'review.json', before: null, lang: 'en', format: 'text',
    requirePaired: false, requireOffline: false, requireEvidenceUrls: false,
  });
});
test('arguments may appear before or after the manifest', () => {
  const args = parseAccessReviewArgs(['--lang', 'fr', '--format', 'json', 'release.json', '--before', 'old.json']);
  assert.equal(args.lang, 'fr');
  assert.equal(args.format, 'json');
  assert.equal(args.before, 'old.json');
});
test('optional audit flags are independent', () => {
  const args = parseAccessReviewArgs(['release.json', '--require-paired', '--require-offline', '--require-evidence-links']);
  assert.equal(args.requirePaired, true);
  assert.equal(args.requireOffline, true);
  assert.equal(args.requireEvidenceUrls, true);
});
test('missing manifest fails as an argument error', () => {
  assert.throws(() => parseAccessReviewArgs([]), ReviewCliError);
  assert.throws(() => parseAccessReviewArgs(['--lang', 'fr']), ReviewCliError);
});
test('help does not trigger a file read', async () => {
  const result = await executeAccessReviewCli(['--help']);
  assert.equal(result.status, 2);
  assert.ok(result.stderr.includes('Usage:'));
  assert.equal(result.stdout, '');
});
test('invalid argument token fails closed', () => {
  for (const args of [['--invalid', 'release.json'], ['release.json', '--write'], ['release.json', '-o', 'report.txt']]) {
    assert.throws(() => parseAccessReviewArgs(args), ReviewCliError);
  }
});
test('duplicate arguments fail closed', () => {
  for (const args of [
    ['release.json', '--lang', 'en', '--lang', 'fr'],
    ['release.json', '--format', 'json', '--format', 'text'],
    ['release.json', '--before', 'first.json', '--before', 'second.json'],
    ['release.json', '--require-paired', '--require-paired'],
    ['release.json', '--require-offline', '--require-offline'],
    ['release.json', '--require-evidence-links', '--require-evidence-links'],
  ]) assert.throws(() => parseAccessReviewArgs(args), ReviewCliError, args.join(' '));
});
test('duplicate current paths fail closed', () => {
  assert.throws(() => parseAccessReviewArgs(['a.json', 'b.json']), ReviewCliError);
});
test('missing option values fail closed', () => {
  for (const flag of ['--lang', '--before', '--format']) {
    assert.throws(() => parseAccessReviewArgs(['release.json', flag]), ReviewCliError);
    assert.throws(() => parseAccessReviewArgs(['release.json', flag, '--require-offline']), ReviewCliError);
  }
});
test('unexpected locale is not silently translated', () => {
  for (const locale of ['FR', 'fr-CA', 'es', UNKNOWN]) assert.throws(() => parseAccessReviewArgs(['release.json', '--lang', locale]), ReviewCliError);
});
test('unexpected format is not accepted', () => {
  for (const format of ['pdf', 'xml', 'csv', 'JSON']) assert.throws(() => parseAccessReviewArgs(['release.json', '--format', format]), ReviewCliError);
});
test('valid local manifest returns exit 0 in direct execution', async () => {
  await temporary(async root => {
    const file = await createFile(root);
    const result = await executeAccessReviewCli([file]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes('release-one'));
  });
});
test('French output preserves no-break space before colon', async () => {
  await temporary(async root => {
    const result = await executeAccessReviewCli([await createFile(root), '--lang', 'fr']);
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('Version\u00a0: release-one'));
    assert.ok(result.stdout.includes('Données en date du\u00a0: UNKNOWN'));
  });
});
test('JSON output returns structured audit counts', async () => {
  await temporary(async root => {
    const result = await executeAccessReviewCli([await createFile(root), '--format', 'json']);
    assert.equal(result.status, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.schema, 'attribution-access-review-report/1');
    assert.equal(output.surfaceCount, 1);
    assert.equal(output.blocked, false);
  });
});
test('HTML output is standalone and requires no network', async () => {
  await temporary(async root => {
    const result = await executeAccessReviewCli([await createFile(root), '--format', 'html', '--lang', 'fr']);
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('lang="fr"'));
    assert.ok(result.stdout.includes("connect-src 'none'"));
    assert.doesNotMatch(result.stdout, /<script\b/iu);
  });
});
test('blocked notice returns exit 1 with evidence finding', async () => {
  await temporary(async root => {
    const release = reviewRelease();
    release.surfaces[0].targets[0].visible = 'NO';
    const result = await executeAccessReviewCli([await createFile(root, release)]);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('NOTICE_HIDDEN'));
  });
});
test('paired-language requirement blocks a single English surface', async () => {
  await temporary(async root => {
    const result = await executeAccessReviewCli([await createFile(root), '--require-paired']);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('LOCALE_COMPANION_MISSING'));
  });
});
test('evidence URL requirement blocks UNKNOWN links', async () => {
  await temporary(async root => {
    const r = reviewRelease();
    r.surfaces[0].targets[0].evidenceUrl = UNKNOWN;
    const result = await executeAccessReviewCli([await createFile(root, r), '--require-evidence-links']);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('REVIEW_EVIDENCE_UNKNOWN'));
  });
});
test('offline requirement blocks an unknown delivery state', async () => {
  await temporary(async root => {
    const r = reviewRelease();
    r.surfaces[0].offline = UNKNOWN;
    const result = await executeAccessReviewCli([await createFile(root, r), '--require-offline']);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('OFFLINE_UNCONFIRMED'));
  });
});
test('comparison against earlier release exposes regression', async () => {
  await temporary(async root => {
    const before = await createFile(root);
    const after = reviewRelease();
    after.releaseId = 'release-two';
    after.surfaces[0].targets[0].widthPx = 43;
    const current = await createFile(root, after, 'new.json');
    const result = await executeAccessReviewCli([current, '--before', before]);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('notice-target-changed'));
  });
});
test('clean comparison returns exit 0', async () => {
  await temporary(async root => {
    const before = await createFile(root);
    const after = reviewRelease();
    after.releaseId = 'release-two';
    const current = await createFile(root, after, 'new.json');
    const result = await executeAccessReviewCli([current, '--before', before]);
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('No recorded changes'));
  });
});
test('missing file returns exit 2', async () => {
  await temporary(async root => {
    const result = await executeAccessReviewCli([join(root, 'absent.json')]);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.ok(result.stderr.length > 0);
  });
});
test('broken JSON returns exit 2', async () => {
  await temporary(async root => {
    const file = join(root, 'bad.json');
    await writeFile(file, '{not-json', 'utf8');
    const result = await executeAccessReviewCli([file]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Invalid JSON/u);
  });
});
test('unsupported schema returns exit 2', async () => {
  await temporary(async root => {
    const result = await executeAccessReviewCli([await createFile(root, { ...reviewRelease(), schema: 'different' })]);
    assert.equal(result.status, 2);
    assert.ok(result.stderr.includes('Unsupported schema'));
  });
});
test('file beyond byte limit returns exit 2', async () => {
  await temporary(async root => {
    const file = join(root, 'large.json');
    await writeFile(file, 'x'.repeat(2_097_153), 'utf8');
    const result = await executeAccessReviewCli([file]);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
  });
});
test('CLI imported as a module does not execute the process', () => {
  assert.equal(isReviewCliEntrypoint(), false);
});
test('CLI subprocess import produces no output', () => {
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', `import(${JSON.stringify(new URL('./access-review-cli.mjs', import.meta.url).href)})`], { encoding: 'utf8', timeout: 15000 });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, '');
  assert.equal(child.stderr, '');
});
test('CLI executable process returns exit 0', async () => {
  await temporary(async root => {
    const child = runProcess([await createFile(root)]);
    assert.equal(child.status, 0, child.stderr);
    assert.ok(child.stdout.includes('release-one'));
  });
});
test('CLI executable process returns exit 1 on missing evidence', async () => {
  await temporary(async root => {
    const r = reviewRelease();
    r.sources[0].permission = UNKNOWN;
    const child = runProcess([await createFile(root, r)]);
    assert.equal(child.status, 1);
    assert.ok(child.stdout.includes('PERMISSION_NOT_YES'));
  });
});
test('CLI executable process returns exit 2 on input error', () => {
  const child = runProcess(['missing-review-unknown-file.json']);
  assert.equal(child.status, 2);
  assert.equal(child.stdout, '');
  assert.ok(child.stderr.length > 0);
});
test('CLI writes no files alongside the manifest', async () => {
  await temporary(async root => {
    const file = await createFile(root);
    const before = (await readdir(root)).sort();
    const child = runProcess([file, '--format', 'html']);
    const after = (await readdir(root)).sort();
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(before, after);
    assert.deepEqual(after, ['review.json']);
  });
});
test('explicit HTML output is parseable text, not an output file', async () => {
  await temporary(async root => {
    const file = await createFile(root);
    const result = await executeAccessReviewCli([file, '--format', 'html']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /^<!doctype html>/u);
    assert.deepEqual((await readdir(root)).sort(), ['review.json']);
  });
});
test('input evidence file is not modified', async () => {
  await temporary(async root => {
    const file = await createFile(root);
    const before = await readFile(file, 'utf8');
    await executeAccessReviewCli([file, '--format', 'json']);
    assert.equal(await readFile(file, 'utf8'), before);
  });
});
