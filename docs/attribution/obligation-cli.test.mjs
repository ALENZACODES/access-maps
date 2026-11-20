import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, symlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  parseObligationArgs, executeObligationCli, OBLIGATION_USAGE, ObligationCliError,
} from './obligation-cli.mjs';
import { obligation, frenchPair } from './obligation-fixtures.mjs';
const dir = dirname(fileURLToPath(import.meta.url));
const cliPath = join(dir, 'obligation-cli.mjs');
async function withFiles(fn, current = obligation(), earlier = null) {
  const root = await mkdtemp(join(tmpdir(), 'attribution-obligations-'));
  try {
    const currentFile = join(root, 'current.json');
    await writeFile(currentFile, JSON.stringify(current), 'utf8');
    const previousFile = join(root, 'previous.json');
    if (earlier !== null) await writeFile(previousFile, JSON.stringify(earlier), 'utf8');
    return await fn({ root, currentFile, previousFile });
  } finally { await rm(root, { recursive: true, force: true }); }
}
function processRun(args) {
  return spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8', timeout: 10000 });
}
test('CLI documents explicit input and language options', () => {
  assert.ok(OBLIGATION_USAGE.includes('<register.json>'));
  assert.ok(OBLIGATION_USAGE.includes('--lang en|fr'));
});
test('CLI exposes stable error class', () => {
  assert.equal(new ObligationCliError('x').name, 'ObligationCliError');
});
test('single register argument uses English text defaults', () => {
  assert.deepEqual(parseObligationArgs(['file.json']), {
    current: 'file.json', before: null, locale: 'en', format: 'text', requirePairs: false,
  });
});
test('CLI handles all explicit options regardless of ordering', () => {
  assert.deepEqual(parseObligationArgs(['--lang', 'fr', 'file.json', '--format', 'json', '--before', 'old.json', '--require-pairs']), {
    current: 'file.json', before: 'old.json', locale: 'fr', format: 'json', requirePairs: true,
  });
});
test('CLI accepts standalone HTML output', () => {
  assert.equal(parseObligationArgs(['file.json', '--format', 'html']).format, 'html');
});
test('CLI accepts locale fr', () => {
  assert.equal(parseObligationArgs(['file.json', '--lang', 'fr']).locale, 'fr');
});
test('CLI accepts explicit EN/FR pairing requirement', () => {
  assert.equal(parseObligationArgs(['file.json', '--require-pairs']).requirePairs, true);
});
test('missing arguments throw a usage error', () => {
  assert.throws(() => parseObligationArgs([]), ObligationCliError);
});
test('help-only arguments throw a usage message without IO', () => {
  assert.throws(() => parseObligationArgs(['--help']), /Usage/u);
});
test('unknown options are rejected', () => {
  for (const args of [['file.json', '--write'], ['--quiet', 'file.json'], ['file.json', '-o', 'result']]) {
    assert.throws(() => parseObligationArgs(args), ObligationCliError);
  }
});
test('missing flag value is rejected', () => {
  for (const flag of ['--lang', '--format', '--before']) {
    assert.throws(() => parseObligationArgs(['file.json', flag]), ObligationCliError);
  }
});
test('option followed immediately by another flag is rejected', () => {
  assert.throws(() => parseObligationArgs(['file.json', '--lang', '--require-pairs']), ObligationCliError);
});
test('duplicate locale option is rejected', () => {
  assert.throws(() => parseObligationArgs(['file.json', '--lang', 'en', '--lang', 'fr']), ObligationCliError);
});
test('duplicate format option is rejected', () => {
  assert.throws(() => parseObligationArgs(['file.json', '--format', 'text', '--format', 'json']), ObligationCliError);
});
test('duplicate earlier-register option is rejected', () => {
  assert.throws(() => parseObligationArgs(['file.json', '--before', 'a.json', '--before', 'b.json']), ObligationCliError);
});
test('duplicate pairing flag is rejected', () => {
  assert.throws(() => parseObligationArgs(['file.json', '--require-pairs', '--require-pairs']), ObligationCliError);
});
test('multiple current register arguments are rejected', () => {
  assert.throws(() => parseObligationArgs(['one.json', 'two.json']), ObligationCliError);
});
test('unknown locale values are rejected', () => {
  for (const locale of ['FR', 'fr-CA', 'es', 'UNKNOWN', '']) {
    assert.throws(() => parseObligationArgs(['file.json', '--lang', locale]), ObligationCliError);
  }
});
test('unknown output formats are rejected', () => {
  for (const format of ['csv', 'yaml', 'pdf', 'XML', '']) {
    assert.throws(() => parseObligationArgs(['file.json', '--format', format]), ObligationCliError);
  }
});
test('non-array arguments are rejected', () => {
  assert.throws(() => parseObligationArgs(null), ObligationCliError);
});
test('non-string argument values are rejected', () => {
  assert.throws(() => parseObligationArgs(['file.json', null]), ObligationCliError);
});
test('CLI executes valid current register without reading other files', async () => {
  await withFiles(async ({ currentFile }) => {
    const result = await executeObligationCli([currentFile]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes('release-example'));
  });
});
test('CLI valid register has empty stderr', async () => {
  await withFiles(async ({ currentFile }) => {
    const result = await executeObligationCli([currentFile]);
    assert.equal(result.stderr, '');
  });
});
test('CLI returns status 1 for a blocked source permission', async () => {
  const bad = obligation();
  bad.sources[0].permission = 'NO';
  await withFiles(async ({ currentFile }) => {
    const result = await executeObligationCli([currentFile]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /PERMISSION_NOT_GRANTED/u);
  }, bad);
});
test('CLI returns status 1 for missing OSM credit placement', async () => {
  const bad = obligation();
  bad.placements = bad.placements.filter(x => x.kind !== 'credit');
  await withFiles(async ({ currentFile }) => {
    const result = await executeObligationCli([currentFile]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /REQUIRED_NOTICE_MISSING/u);
  }, bad);
});
test('CLI returns status 1 for target below 44px', async () => {
  const bad = obligation();
  bad.pages[0].targetPx = 43;
  await withFiles(async ({ currentFile }) => {
    const result = await executeObligationCli([currentFile]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /TARGET_BELOW_MINIMUM/u);
  }, bad);
});
test('CLI returns status 2 for missing JSON file', async () => {
  await withFiles(async ({ root }) => {
    const result = await executeObligationCli([join(root, 'not-found.json')]);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.ok(result.stderr.length > 0);
  });
});
test('CLI returns status 2 for malformed JSON input', async () => {
  await withFiles(async ({ currentFile }) => {
    await writeFile(currentFile, 'not-json');
    const result = await executeObligationCli([currentFile]);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Invalid JSON/u);
  });
});
test('CLI returns status 2 for unsupported schema', async () => {
  const bad = { ...obligation(), schema: 'unsupported' };
  await withFiles(async ({ currentFile }) => {
    const result = await executeObligationCli([currentFile]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Unsupported schema/u);
  }, bad);
});
test('CLI returns status 2 for unexpected JSON fields', async () => {
  const bad = { ...obligation(), speculative: true };
  await withFiles(async ({ currentFile }) => {
    const result = await executeObligationCli([currentFile]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Unknown field/u);
  }, bad);
});
test('CLI returns status 2 when input is a directory', async () => {
  await withFiles(async ({ root }) => {
    const result = await executeObligationCli([root]);
    assert.equal(result.status, 2);
  });
});
test('CLI refuses to follow a symlink as input', async () => {
  await withFiles(async ({ root, currentFile }) => {
    const link = join(root, 'link.json');
    await symlink(currentFile, link);
    const result = await executeObligationCli([link]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /regular file/u);
  });
});
test('CLI rejects input larger than its size budget', async () => {
  await withFiles(async ({ currentFile }) => {
    await writeFile(currentFile, 'x'.repeat(2_097_153));
    const result = await executeObligationCli([currentFile]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /maximum bytes/u);
  });
});
test('CLI French text output contains U+00A0 before a colon', async () => {
  await withFiles(async ({ currentFile }) => {
    const result = await executeObligationCli([currentFile, '--lang', 'fr']);
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('Version\u00a0: release-example'));
  });
});
test('CLI HTML output has an EN language declaration', async () => {
  await withFiles(async ({ currentFile }) => {
    const result = await executeObligationCli([currentFile, '--format', 'html']);
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('<html lang="en">'));
  });
});
test('CLI HTML output has an FR language declaration', async () => {
  await withFiles(async ({ currentFile }) => {
    const result = await executeObligationCli([currentFile, '--lang', 'fr', '--format', 'html']);
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('<html lang="fr">'));
  });
});
test('CLI JSON output has a versioned audit schema', async () => {
  await withFiles(async ({ currentFile }) => {
    const result = await executeObligationCli([currentFile, '--format', 'json']);
    assert.equal(result.status, 0);
    assert.equal(JSON.parse(result.stdout).schema, 'attribution-obligation-report/1');
  });
});
test('CLI JSON output retains source evidence IDs', async () => {
  await withFiles(async ({ currentFile }) => {
    const result = await executeObligationCli([currentFile, '--format', 'json']);
    assert.deepEqual(JSON.parse(result.stdout).audit.sourcePages['osm-source'], ['map-en']);
  });
});
test('CLI EN/FR companion requirement succeeds for two local pages', async () => {
  await withFiles(async ({ currentFile }) => {
    const result = await executeObligationCli([currentFile, '--require-pairs']);
    assert.equal(result.status, 0, result.stderr);
  }, frenchPair());
});
test('CLI EN/FR companion requirement blocks missing page', async () => {
  await withFiles(async ({ currentFile }) => {
    const result = await executeObligationCli([currentFile, '--require-pairs']);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /LANGUAGE_COMPANION_MISSING/u);
  });
});
test('CLI before/after comparison shows lost credit placement', async () => {
  const after = obligation();
  after.placements = after.placements.filter(x => x.kind !== 'credit');
  await withFiles(async ({ currentFile, previousFile }) => {
    const result = await executeObligationCli([currentFile, '--before', previousFile]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /Changes since earlier register/u);
    assert.match(result.stdout, /placement-removed/u);
  }, after, obligation());
});
test('CLI before/after JSON contains structured changes', async () => {
  const after = obligation();
  after.sources[0].permission = 'NO';
  await withFiles(async ({ currentFile, previousFile }) => {
    const result = await executeObligationCli([currentFile, '--before', previousFile, '--format', 'json']);
    assert.equal(result.status, 1);
    assert.ok(JSON.parse(result.stdout).comparison.changes.some(x => x.kind === 'source-changed'));
  }, after, obligation());
});
test('CLI invalid before file exits 2', async () => {
  await withFiles(async ({ currentFile, root }) => {
    const result = await executeObligationCli([currentFile, '--before', join(root, 'missing.json')]);
    assert.equal(result.status, 2);
  });
});
test('CLI never writes reports to the input directory', async () => {
  await withFiles(async ({ currentFile }) => {
    const before = await readFile(currentFile, 'utf8');
    const result = await executeObligationCli([currentFile, '--format', 'html']);
    assert.equal(result.status, 0);
    assert.equal(await readFile(currentFile, 'utf8'), before);
  });
});
test('importing CLI does not start an executable process', () => {
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(new URL('./obligation-cli.mjs', import.meta.url).href)});`], { encoding: 'utf8', timeout: 10000 });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, '');
  assert.equal(child.stderr, '');
});
test('executing the actual .mjs CLI returns status 0', async () => {
  await withFiles(async ({ currentFile }) => {
    const child = processRun([currentFile]);
    assert.equal(child.status, 0, child.stderr);
    assert.ok(child.stdout.includes('release-example'));
  });
});
test('executing the actual .mjs CLI returns status 1 on a block', async () => {
  const bad = obligation();
  bad.sources[0].permission = 'UNKNOWN';
  await withFiles(async ({ currentFile }) => {
    const child = processRun([currentFile]);
    assert.equal(child.status, 1, child.stderr);
    assert.match(child.stdout, /PERMISSION_NOT_GRANTED/u);
  }, bad);
});
test('executing the actual .mjs CLI returns status 2 on bad JSON', async () => {
  await withFiles(async ({ currentFile }) => {
    await writeFile(currentFile, 'broken-json');
    const child = processRun([currentFile]);
    assert.equal(child.status, 2);
    assert.ok(child.stderr.length > 0);
  });
});
test('executing actual CLI process in French returns localised text', async () => {
  await withFiles(async ({ currentFile }) => {
    const child = processRun([currentFile, '--lang', 'fr']);
    assert.equal(child.status, 0);
    assert.match(child.stdout, /Données en date du\u00a0: UNKNOWN/u);
  });
});
test('actual CLI help exits 2 and emits usage text', () => {
  const child = processRun(['--help']);
  assert.equal(child.status, 2);
  assert.match(child.stderr, /Usage/u);
});
