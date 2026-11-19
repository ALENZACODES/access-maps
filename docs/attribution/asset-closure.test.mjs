import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { auditAssetClosure, extractDependencies, renderClosureText } from './asset-closure.mjs';
import { executeClosureCli } from './asset-closure-cli.mjs';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
async function fixture(fn) {
  const directory = await mkdtemp(join(tmpdir(), 'attribution-assets-'));
  try { return await fn(directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
}
async function write(root, file, content) {
  const target = join(root, file);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, 'utf8');
}
async function simple(root) {
  await write(root, 'index.html', '<link rel="stylesheet" href="./style.css"><script type="module" src="./src/route.mjs"></script>');
  await write(root, 'style.css', 'body { font: 1rem system-ui; }');
  await write(root, 'src/route.mjs', "import './core.mjs';");
  await write(root, 'src/core.mjs', "export const ok = true;");
}

test('local graph succeeds and traverses all declared assets', async () => fixture(async root => {
  await simple(root);
  const report = await auditAssetClosure(root, ['index.html']);
  assert.equal(report.blocked, false);
  assert.deepEqual(report.files, ['index.html', 'src/core.mjs', 'src/route.mjs', 'style.css']);
}));

test('missing HTML entry blocks', async () => fixture(async root => {
  const report = await auditAssetClosure(root, ['missing.html']);
  assert.equal(report.blocked, true);
  assert.equal(report.findings[0]?.code, 'MISSING_FILE');
}));

test('missing stylesheet blocks', async () => fixture(async root => {
  await simple(root);
  await write(root, 'index.html', '<link rel="stylesheet" href="./missing.css">');
  const report = await auditAssetClosure(root, ['index.html']);
  assert.ok(report.findings.some(f => f.target === 'missing.css'));
}));

test('missing route module blocks', async () => fixture(async root => {
  await write(root, 'index.html', '<script type="module" src="./missing-route.mjs"></script>');
  const result = await auditAssetClosure(root, ['index.html']);
  assert.ok(result.findings.some(f => f.target === 'missing-route.mjs'));
}));

test('missing source import blocks', async () => fixture(async root => {
  await write(root, 'index.html', '<script src="./route.mjs"></script>');
  await write(root, 'route.mjs', "import './lost.mjs';");
  assert.ok((await auditAssetClosure(root, ['index.html'])).findings.some(f => f.target === 'lost.mjs'));
}));

test('test-read dependencies include nonimported HTML files', async () => fixture(async root => {
  await write(root, 'route.test.mjs', "const html = await read('page.html');");
  const result = await auditAssetClosure(root, ['route.test.mjs']);
  assert.ok(result.findings.some(f => f.target === 'page.html'));
}));

test('test-read dependencies include nonimported CSS files', async () => fixture(async root => {
  await write(root, 'route.test.mjs', "const css = await read('page.css');");
  const result = await auditAssetClosure(root, ['route.test.mjs']);
  assert.ok(result.findings.some(f => f.target === 'page.css'));
}));

test('test-read dependencies resolve when files exist', async () => fixture(async root => {
  await write(root, 'route.test.mjs', "const html = await read('page.html');");
  await write(root, 'page.html', '<main></main>');
  assert.equal((await auditAssetClosure(root, ['route.test.mjs'])).blocked, false);
}));

test('external script assets block', async () => fixture(async root => {
  await write(root, 'index.html', '<script src="https://example.org/a.js"></script>');
  assert.ok((await auditAssetClosure(root, ['index.html'])).findings.some(f => f.code === 'REMOTE_EXECUTABLE_ASSET'));
}));

test('external stylesheet assets block', async () => fixture(async root => {
  await write(root, 'index.html', '<link rel="stylesheet" href="https://example.org/a.css">');
  assert.ok((await auditAssetClosure(root, ['index.html'])).findings.some(f => f.code === 'REMOTE_EXECUTABLE_ASSET'));
}));

test('external anchor links are not executable dependencies', async () => fixture(async root => {
  await write(root, 'index.html', '<a href="https://example.org/licence">Terms</a>');
  assert.equal((await auditAssetClosure(root, ['index.html'])).blocked, false);
}));

test('upward traversal in import is rejected', async () => fixture(async root => {
  await write(root, 'route.mjs', "import '../../../outside.mjs';");
  assert.ok((await auditAssetClosure(root, ['route.mjs'])).findings.some(f => f.code === 'PATH_ESCAPE'));
}));

test('upward traversal in entry is rejected', async () => fixture(async root => {
  assert.ok((await auditAssetClosure(root, ['../outside.html'])).findings.some(f => f.code === 'PATH_ESCAPE'));
}));

test('absolute entry is rejected when outside root', async () => fixture(async root => {
  assert.ok((await auditAssetClosure(root, ['/tmp/outside.html'])).findings.some(f => f.code === 'PATH_ESCAPE'));
}));

test('query strings on local assets are removed before lookup', async () => fixture(async root => {
  await write(root, 'index.html', '<script src="./route.mjs?v=1"></script>');
  await write(root, 'route.mjs', 'export const ok=1;');
  assert.equal((await auditAssetClosure(root, ['index.html'])).blocked, false);
}));

test('fragment links are not file dependencies', async () => fixture(async root => {
  await write(root, 'index.html', '<a href="#main">Skip</a>');
  assert.equal((await auditAssetClosure(root, ['index.html'])).blocked, false);
}));

test('CSS URL local dependency is inspected', async () => fixture(async root => {
  await write(root, 'style.css', 'body{background-image:url("./missing.png")}');
  assert.ok((await auditAssetClosure(root, ['style.css'])).findings.some(f => f.target === 'missing.png'));
}));

test('CSS external URL is rejected', async () => fixture(async root => {
  await write(root, 'style.css', 'body{background-image:url("https://example.org/a.png")}');
  assert.ok((await auditAssetClosure(root, ['style.css'])).findings.some(f => f.code === 'REMOTE_EXECUTABLE_ASSET'));
}));

test('symlinked files are rejected', async () => fixture(async root => {
  await write(root, 'real.html', '<main></main>');
  await symlink(join(root, 'real.html'), join(root, 'shortcut.html'));
  assert.ok((await auditAssetClosure(root, ['shortcut.html'])).findings.some(f => f.code === 'NOT_REGULAR_FILE'));
}));

test('unbounded individual file is rejected', async () => fixture(async root => {
  await write(root, 'index.html', 'X'.repeat(200));
  assert.ok((await auditAssetClosure(root, ['index.html'], { maxBytes: 20 })).findings.some(f => f.code === 'FILE_TOO_LARGE'));
}));

test('bounded file count produces blocking finding', async () => fixture(async root => {
  await simple(root);
  assert.ok((await auditAssetClosure(root, ['index.html'], { maxFiles: 1 })).findings.some(f => f.code === 'FILE_COUNT_LIMIT'));
}));

test('invalid file count rejects', async () => fixture(async root => {
  await assert.rejects(auditAssetClosure(root, ['index.html'], { maxFiles: 0 }), TypeError);
}));

test('invalid byte bound rejects', async () => fixture(async root => {
  await assert.rejects(auditAssetClosure(root, ['index.html'], { maxBytes: -1 }), TypeError);
}));

test('empty entry list rejects', async () => fixture(async root => {
  await assert.rejects(auditAssetClosure(root, []), TypeError);
}));

test('cyclic module imports do not loop', async () => fixture(async root => {
  await write(root, 'a.mjs', "import './b.mjs';");
  await write(root, 'b.mjs', "import './a.mjs';");
  const report = await auditAssetClosure(root, ['a.mjs']);
  assert.equal(report.blocked, false);
  assert.equal(report.files.length, 2);
}));

test('ESM named exports are scanned', () => {
  assert.deepEqual(extractDependencies('test.mjs', "export { one } from './one.mjs';"), [{ target: './one.mjs', kind: 'module' }]);
});

test('dynamic literal imports are scanned', () => {
  assert.deepEqual(extractDependencies('test.mjs', "const m = import('./one.mjs');"), [{ target: './one.mjs', kind: 'module' }]);
});

test('CSS local imports are scanned', () => {
  const found = extractDependencies('style.css', "@import './theme.css';");
  assert.ok(found.some(x => x.target === './theme.css'));
});

test('no included entry produces a false accessibility judgement', async () => fixture(async root => {
  await write(root, 'index.html', '<main>UNKNOWN</main>');
  const report = await auditAssetClosure(root, ['index.html']);
  assert.equal(report.blocked, false);
  assert.equal('accessibility' in report, false);
}));

test('English report shows files and status', async () => fixture(async root => {
  await simple(root);
  const report = renderClosureText(await auditAssetClosure(root, ['index.html']), 'en');
  assert.match(report, /Files inspected: 4/u);
  assert.match(report, /No blockers/u);
}));

test('French report uses required nonbreaking colon spacing', async () => fixture(async root => {
  await simple(root);
  const report = renderClosureText(await auditAssetClosure(root, ['index.html']), 'fr');
  assert.ok(report.includes('État\u00a0:'));
  assert.ok(report.includes('Fichiers inspectés\u00a0:'));
}));

test('CLI returns status zero for complete local route', async () => fixture(async root => {
  await simple(root);
  assert.equal((await executeClosureCli([root, 'index.html'])).status, 0);
}));

test('CLI returns status one for missing entry', async () => fixture(async root => {
  assert.equal((await executeClosureCli([root, 'missing.html'])).status, 1);
}));

test('CLI returns status two for missing options', async () => {
  assert.equal((await executeClosureCli([])).status, 2);
});

test('CLI rejects unsupported locale', async () => {
  assert.equal((await executeClosureCli(['/tmp', 'index.html', '--lang', 'es'])).status, 2);
});

test('CLI emits French report on request', async () => fixture(async root => {
  await simple(root);
  const result = await executeClosureCli([root, 'index.html', '--lang', 'fr']);
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes('Fichiers inspectés\u00a0:'));
}));

test('CLI process can execute actual .mjs entry', async () => fixture(async root => {
  await simple(root);
  const executable = fileURLToPath(new URL('./asset-closure-cli.mjs', import.meta.url));
  const child = spawnSync(process.execPath, [executable, root, 'index.html'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(child.status, 0, child.stderr);
  assert.ok(child.stdout.includes('No blockers'));
}));

test('CLI process returns blocking code for missing file', () => {
  const executable = fileURLToPath(new URL('./asset-closure-cli.mjs', import.meta.url));
  const child = spawnSync(process.execPath, [executable, currentDirectory, 'missing-asset.html'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(child.status, 1);
});

test('actual claim-trace assets and all imports form a complete closure', async () => {
  const report = await auditAssetClosure(currentDirectory, ['claim-trace.html', 'claim-trace-wiring.test.mjs']);
  assert.equal(report.blocked, false, JSON.stringify(report.findings));
  assert.ok(report.files.includes('claim-trace.html'));
  assert.ok(report.files.includes('claim-trace.css'));
  assert.ok(report.files.includes('claim-trace-route.mjs'));
  assert.ok(report.files.includes('CLAIM_TRACE_README.md'));
});
