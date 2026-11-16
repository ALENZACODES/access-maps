import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  auditOfflineClosure, closureText, type ClosureEntry, type ClosureOptions,
} from './p15d-closure.js';

const created: string[] = [];
afterEach(async () => {
  for (const path of created.splice(0)) await rm(path, { recursive: true, force: true });
});
async function fixture(files: Record<string, string>): Promise<ClosureOptions> {
  const root = await mkdtemp(join(tmpdir(), 'offline-closure-'));
  created.push(root);
  const entries: ClosureEntry[] = [];
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), content);
    const bytes = Buffer.from(content);
    const type = path.endsWith('.html') ? 'text/html' :
      path.endsWith('.css') ? 'text/css' : path.endsWith('.js') ? 'application/javascript' :
        path.endsWith('.json') ? 'application/json' : 'image/svg+xml';
    entries.push({ path, bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'), mediaType: type });
  }
  return { root, entries, pagePaths: ['index.html'], maxFileBytes: 4096, maxTotalBytes: 16384 };
}
const html = '<!doctype html><html><head><link rel="stylesheet" href="a.css"></head>' +
  '<body><script src="app.js"></script><img src="icon.svg"></body></html>';
const base = { 'index.html': html, 'a.css': 'body {margin:0}',
  'app.js': 'export const value = 1;', 'icon.svg': '<svg></svg>' };
async function codes(options: ClosureOptions): Promise<string[]> {
  return (await auditOfflineClosure(options)).findings.map(issue => issue.code);
}

describe('offline dependency closure', () => {
  it('accepts a closed local asset graph', async () => {
    const report = await auditOfflineClosure(await fixture(base));
    assert.equal(report.ok, true);
    assert.equal(report.files, 4);
    assert.equal(report.reachableFiles, 4);
    assert.ok(report.bytesRead > 0);
  });
  it('rejects external CSS references', async () => {
    const input = await fixture({ ...base, 'a.css': '@import "https://example.org/theme.css";' });
    assert.ok((await codes(input)).includes('REMOTE'));
  });
  it('rejects external HTML script references', async () => {
    const input = await fixture({ ...base, 'index.html': html.replace('app.js',
      'https://example.org/app.js') });
    assert.ok((await codes(input)).includes('REMOTE'));
  });
  it('rejects protocol-relative URLs', async () => {
    const input = await fixture({ ...base, 'index.html': html.replace('icon.svg',
      '//static.example.org/icon.svg') });
    assert.ok((await codes(input)).includes('REMOTE'));
  });
  it('rejects undeclared local dependencies', async () => {
    const input = await fixture({ ...base, 'index.html': html.replace('icon.svg', 'missing.svg') });
    assert.ok((await codes(input)).includes('UNDECLARED'));
  });
  it('rejects path escapes in CSS URLs', async () => {
    const input = await fixture({ ...base, 'a.css': 'div{background:url(../../outside.svg)}' });
    assert.ok((await codes(input)).includes('BAD_PATH'));
  });
  it('blocks a referenced file missing from disk', async () => {
    const input = await fixture(base);
    await rm(join(input.root, 'icon.svg'));
    assert.ok((await codes(input)).includes('MISSING'));
  });
  it('blocks a changed content digest', async () => {
    const input = await fixture(base);
    await writeFile(join(input.root, 'a.css'), 'body {paddin:0}');
    assert.ok((await codes(input)).includes('HASH'));
  });
  it('blocks a changed size', async () => {
    const input = await fixture(base);
    await writeFile(join(input.root, 'icon.svg'), 'much more data');
    assert.ok((await codes(input)).includes('SIZE'));
  });
  it('blocks an incorrect declared size', async () => {
    const input = await fixture(base);
    const entries = input.entries.map(item => item.path === 'icon.svg' ?
      { ...item, bytes: item.bytes + 1 } : item);
    assert.ok((await codes({ ...input, entries })).includes('SIZE'));
  });
  it('blocks a symlink even if its target is within root', async () => {
    const input = await fixture(base);
    await rm(join(input.root, 'icon.svg'));
    await symlink(join(input.root, 'a.css'), join(input.root, 'icon.svg'));
    assert.ok((await codes(input)).includes('LINK'));
  });
  it('blocks oversized individual assets', async () => {
    const input = await fixture(base);
    assert.ok((await codes({ ...input, maxFileBytes: 4 })).includes('BYTES'));
  });
  it('blocks aggregate budgets', async () => {
    const input = await fixture(base);
    assert.ok((await codes({ ...input, maxTotalBytes: 10 })).includes('BUDGET'));
  });
  it('blocks a malformed digest in inventory', async () => {
    const input = await fixture(base);
    const entries = input.entries.map(item => ({ ...item, sha256: 'invalid' }));
    assert.ok((await codes({ ...input, entries })).includes('BAD_INDEX'));
  });
  it('blocks duplicate paths', async () => {
    const input = await fixture(base);
    assert.ok((await codes({ ...input, entries: [...input.entries, input.entries[0]!] }))
      .includes('DUPLICATE'));
  });
  it('blocks an unsupported extension for the declared type', async () => {
    const input = await fixture(base);
    const entries = input.entries.map(item => item.path === 'app.js' ?
      { ...item, mediaType: 'text/css' as const } : item);
    assert.ok((await codes({ ...input, entries })).includes('MIME'));
  });
  it('blocks unreferenced inventory files', async () => {
    const input = await fixture({ ...base, 'unused.json': '{}' });
    assert.ok((await codes(input)).includes('UNUSED'));
  });
  it('blocks absent entry pages', async () => {
    const input = await fixture(base);
    assert.ok((await codes({ ...input, pagePaths: [] })).includes('NO_ENTRY'));
  });
  it('blocks entries not declared as HTML', async () => {
    const input = await fixture(base);
    assert.ok((await codes({ ...input, pagePaths: ['a.css'] })).includes('NO_ENTRY'));
  });
  it('blocks CSS circular imports', async () => {
    const input = await fixture({ 'index.html': '<link href="a.css">',
      'a.css': '@import "b.css";', 'b.css': '@import "a.css";' });
    assert.ok((await codes(input)).includes('CYCLE'));
  });
  it('includes local static JS imports in the graph', async () => {
    const input = await fixture({ ...base, 'app.js': 'import "extra.js";',
      'extra.js': 'export const data = 3;' });
    assert.equal((await auditOfflineClosure(input)).ok, true);
  });
  it('blocks a nonliteral module import', async () => {
    const input = await fixture({ ...base, 'app.js': 'const mod = import(getPath());' });
    assert.ok((await codes(input)).includes('DYNAMIC'));
  });
  it('blocks a runtime fetch from a script', async () => {
    const input = await fixture({ ...base, 'app.js': 'fetch("/api/places");' });
    assert.ok((await codes(input)).includes('DYNAMIC'));
  });
  it('blocks invalid UTF-8 in local text assets', async () => {
    const input = await fixture(base);
    await writeFile(join(input.root, 'a.css'), Buffer.from([0xff, 0xfe]));
    const bytes = await readFile(join(input.root, 'a.css'));
    const entries = input.entries.map(item => item.path === 'a.css' ? {
      ...item, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
    } : item);
    assert.ok((await codes({ ...input, entries })).includes('ENCODING'));
  });
  it('reports bilingual diagnostics', async () => {
    const input = await fixture({ ...base, 'a.css': '@import "https://example.org/a.css";' });
    const report = await auditOfflineClosure(input);
    assert.match(closureText(report, 'en'), /remote assets/);
    assert.match(closureText(report, 'fr'), /ressources distantes/);
  });
  it('rejects invalid byte limit configuration', async () => {
    const input = await fixture(base);
    await assert.rejects(auditOfflineClosure({ ...input, maxFileBytes: -5 }), RangeError);
  });
});
