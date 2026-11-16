import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  parseImpactArguments, runImpactGate, readImpactFile,
} from './impact-cli.mjs';
import { readLocalPackage, mountImpactRoute } from './impact-route.mjs';
import { impactWords, impactLocale, impactRule, impactMessageCoverage } from './impact-messages.mjs';
import { IMPACT_RULES } from './impact-audit.mjs';
import { UNKNOWN, emptyRecord } from './provenance-core.mjs';
import { blankSurface } from './disclosure-core.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const text = (name) => readFile(join(directory, name), 'utf8');

function packageFile(size = 48) {
  return JSON.stringify({
    inventory: { version: 1, records: [{
      ...emptyRecord('source'), title: 'Open example', sourceName: 'Example data',
      status: 'included', use: 'place', provider: 'other',
      sourceUrl: 'https://example.org/source', licence: 'OTHER-OPEN',
      licenceUrl: 'https://example.org/terms', acquiredOn: '2026-10-01',
      termsReviewedOn: '2026-10-01', datasetAsOf: UNKNOWN,
      notice: 'Example data — OTHER-OPEN', containsOdbl: false,
      derivedFromOdbl: false, redistributionAllowed: true,
    }] },
    register: { version: 1, surfaces: [{
      ...blankSurface('places'), titleEn: 'Places', titleFr: 'Lieux',
      kind: 'place', state: 'included', path: '/places',
      delivery: 'offline', lastReviewedOn: '2026-10-01', sourceDate: UNKNOWN,
      sourceIds: ['source'], creditEn: 'Example data', creditFr: 'Example data',
      noticeEn: 'OTHER-OPEN', noticeFr: 'OTHER-OPEN',
      supportsKeyboard: 'yes', supportsScreenReader: 'yes', minimumTargetPx: size,
    }] },
  });
}

describe('command-line release integration', () => {
  test('requires exactly two package paths', () => {
    assert.throws(() => parseImpactArguments([]));
    assert.throws(() => parseImpactArguments(['a']));
    assert.throws(() => parseImpactArguments(['a', 'b', 'c']));
  });
  test('accepts two paths and explicit date', () => {
    assert.deepEqual(parseImpactArguments(['old.json', 'new.json', '--date', '2026-11-15']).files,
      ['old.json', 'new.json']);
  });
  test('accepts JSON output option', () => {
    assert.equal(parseImpactArguments(['--json', 'a', 'b']).json, true);
  });
  test('refuses repeated JSON option', () => {
    assert.throws(() => parseImpactArguments(['--json', '--json', 'a', 'b']));
  });
  test('refuses repeated date option', () => {
    assert.throws(() => parseImpactArguments(['a', 'b', '--date', '2026-11-15', '--date', '2026-11-15']));
  });
  test('refuses unsupported flags', () => {
    assert.throws(() => parseImpactArguments(['a', 'b', '--shell']));
  });
  test('refuses invalid dates', () => {
    assert.throws(() => parseImpactArguments(['a', 'b', '--date', '2026-02-30']));
  });
  test('date does not default to current date', () => {
    assert.equal(parseImpactArguments(['a', 'b']).referenceDate, UNKNOWN);
  });
  test('valid unchanged package returns success', async () => {
    let output = '';
    const code = await runImpactGate(['previous', 'candidate'], {
      read: async () => packageFile(), write: (message) => { output += message; },
    });
    assert.equal(code, 0);
    assert.match(output, /Change gate: PASS/u);
  });
  test('smaller target returns blocking exit code', async () => {
    let output = '';
    const code = await runImpactGate(['previous', 'candidate'], {
      read: async (path) => path === 'previous' ? packageFile() : packageFile(30),
      write: (message) => { output += message; },
    });
    assert.equal(code, 1);
    assert.match(output, /SURFACE_TARGET_REDUCED/u);
  });
  test('invalid JSON returns input error', async () => {
    let error = '';
    const code = await runImpactGate(['previous', 'candidate'], {
      read: async (path) => path === 'candidate' ? '{' : packageFile(),
      error: (message) => { error += message; },
    });
    assert.equal(code, 2);
    assert.match(error, /input error/u);
  });
  test('JSON mode serializes a valid result', async () => {
    let output = '';
    const code = await runImpactGate(['previous', 'candidate', '--json'], {
      read: async () => packageFile(), write: (message) => { output += message; },
    });
    assert.equal(code, 0);
    assert.equal(JSON.parse(output).passed, true);
  });
  test('read errors return input error', async () => {
    let error = '';
    const code = await runImpactGate(['a', 'b'], {
      read: async () => { throw new Error('File missing'); },
      error: (message) => { error += message; },
    });
    assert.equal(code, 2);
    assert.match(error, /File missing/u);
  });
  test('disk reader accepts small text files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'impact-reader-'));
    try {
      const path = join(directory, 'package.json');
      await writeFile(path, packageFile());
      assert.equal(await readImpactFile(path), packageFile());
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  test('disk reader rejects missing files', async () => {
    await assert.rejects(() => readImpactFile('/nonexistent-impact-package.json'));
  });
  test('CLI process exits 2 for missing arguments', () => {
    const result = spawnSync(process.execPath, [join(directory, 'impact-cli.mjs')], { encoding: 'utf8' });
    assert.equal(result.status, 2);
  });
  test('CLI process exits 1 for regression', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'impact-cli-'));
    try {
      const before = join(dir, 'before.json');
      const after = join(dir, 'after.json');
      await writeFile(before, packageFile());
      await writeFile(after, packageFile(20));
      const result = spawnSync(process.execPath, [join(directory, 'impact-cli.mjs'), before, after],
        { encoding: 'utf8' });
      assert.equal(result.status, 1);
      assert.match(result.stdout, /BLOCKED/u);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  test('CLI process exits 0 for no regression', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'impact-cli-'));
    try {
      const before = join(dir, 'before.json');
      const after = join(dir, 'after.json');
      await writeFile(before, packageFile());
      await writeFile(after, packageFile());
      const result = spawnSync(process.execPath, [join(directory, 'impact-cli.mjs'), before, after],
        { encoding: 'utf8' });
      assert.equal(result.status, 0);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});

describe('language coverage', () => {
  test('english is default', () => assert.equal(impactLocale('unknown'), 'en'));
  test('french can be selected', () => assert.equal(impactLocale('fr'), 'fr'));
  test('language keys are complete', () => {
    assert.deepEqual(impactMessageCoverage(), {
      missingFrench: [], missingEnglish: [], missingTranslations: [],
    });
  });
  test('all release rules have French explanations', () => {
    for (const rule of Object.keys(IMPACT_RULES)) {
      assert.notEqual(impactRule(rule, 'fr'), rule);
    }
  });
  test('all release rules have English explanations', () => {
    for (const rule of Object.keys(IMPACT_RULES)) {
      assert.equal(impactRule(rule, 'en'), IMPACT_RULES[rule]);
    }
  });
  test('UNKNOWN remains untranslated', () => {
    assert.equal(impactWords('en').unknown, 'UNKNOWN');
    assert.equal(impactWords('fr').unknown, 'UNKNOWN');
  });
  test('French app name uses curly apostrophe', () => {
    assert.equal(impactWords('fr').app, 'l’App');
  });
  test('French strings contain no straight apostrophes', () => {
    for (const value of Object.values(impactWords('fr'))) {
      assert.ok(!value.includes("'"), value);
    }
  });
  test('French punctuation uses a narrow space before semicolon', () => {
    assert.match(impactRule('DATASET_SOURCE_CHANGED', 'fr'), /\u202f;/u);
  });
  test('English links have translated French labels', () => {
    for (const key of ['home', 'datasets', 'surfaces', 'compare', 'reset', 'copy']) {
      assert.ok(impactWords('en')[key]);
      assert.ok(impactWords('fr')[key]);
    }
  });
});

describe('live route source and accessibility constraints', () => {
  test('static HTML loads the live route', async () => {
    assert.match(await text('impact.html'), /src="impact-route.mjs"/u);
  });
  test('route mounts on the actual root', async () => {
    const source = await text('impact-route.mjs');
    assert.match(source, /getElementById\('impact-root'\)/u);
    assert.match(source, /mountImpactRoute\(\)/u);
  });
  test('route imports release gate via wired module', async () => {
    const route = await text('impact-route.mjs');
    const bridge = await text('impact-route-deps.mjs');
    assert.match(route, /impact-route-deps.mjs/u);
    assert.match(bridge, /impact-audit.mjs/u);
  });
  test('route imports bilingual user text', async () => {
    assert.match(await text('impact-route.mjs'), /impact-messages.mjs/u);
  });
  test('route uses the shared comparison contract', async () => {
    assert.match(await text('impact-route.mjs'), /impact-core.mjs/u);
  });
  test('sources page links to live route', async () => {
    assert.match(await text('route.mjs'), /impact.html/u);
  });
  test('surface editor links to live route', async () => {
    assert.match(await text('disclosure-route.mjs'), /impact.html/u);
  });
  test('provenance editor links to live route', async () => {
    assert.match(await text('provenance-route.mjs'), /impact.html/u);
  });
  test('HTML forbids network connections', async () => {
    assert.match(await text('impact.html'), /connect-src 'none'/u);
  });
  test('HTML forbids remote fonts and images', async () => {
    const html = await text('impact.html');
    assert.match(html, /img-src 'none'/u);
    assert.match(html, /font-src 'none'/u);
  });
  test('HTML uses local CSS', async () => {
    assert.match(await text('impact.html'), /href="impact.css"/u);
  });
  test('HTML has skip navigation', async () => {
    assert.match(await text('impact.html'), /href="#main-content"/u);
  });
  test('HTML has a French no-script fallback', async () => {
    assert.match(await text('impact.html'), /lang="fr"/u);
  });
  test('CSS control targets have 44 pixel minimums', async () => {
    const css = await text('impact.css');
    assert.match(css, /min-height:\s*44px/u);
    assert.match(css, /min-width:\s*44px/u);
  });
  test('CSS has explicit focus indicator', async () => {
    assert.match(await text('impact.css'), /:focus-visible/u);
  });
  test('CSS respects reduced motion', async () => {
    assert.match(await text('impact.css'), /prefers-reduced-motion/u);
  });
  test('CSS considers forced colors', async () => {
    assert.match(await text('impact.css'), /forced-colors:\s*active/u);
  });
  test('live route has no network APIs', async () => {
    const route = await text('impact-route.mjs');
    assert.doesNotMatch(route, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/u);
  });
  test('live route has no browser persistence APIs', async () => {
    const route = await text('impact-route.mjs');
    assert.doesNotMatch(route, /\b(?:localStorage|sessionStorage|indexedDB)\b/u);
  });
  test('live route does not inject untrusted HTML', async () => {
    assert.doesNotMatch(await text('impact-route.mjs'), /\binnerHTML\b|\bouterHTML\b/u);
  });
  test('live route does not create a remote script', async () => {
    assert.doesNotMatch(await text('impact-route.mjs'), /createElement\(['"]script['"]\)/u);
  });
  test('source route does not use remote stylesheet', async () => {
    assert.doesNotMatch(await text('impact.html'), /href="https?:/u);
  });
  test('readLocalPackage rejects absent file', async () => {
    await assert.rejects(() => readLocalPackage(null));
  });
  test('readLocalPackage rejects oversized file', async () => {
    await assert.rejects(() => readLocalPackage({ size: 9_999_999, text: async () => '' }));
  });
  test('readLocalPackage reads complete package', async () => {
    const value = await readLocalPackage({ size: 100, text: async () => packageFile() });
    assert.equal(value.register.surfaces[0].minimumTargetPx, 48);
  });
  test('mount requires root', () => {
    assert.throws(() => mountImpactRoute({ getElementById: () => null }, {}), /Missing impact root/u);
  });
});
