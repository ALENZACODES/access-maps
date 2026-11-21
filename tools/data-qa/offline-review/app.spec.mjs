import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyKeys } from './copy.mjs';
import { createNode, initialState, preferredDate, readLocalFile, reviewInputs, validPolicy } from './app.mjs';
import { LIMITS } from './schema.mjs';
import { manifest, POLICY } from './test-helpers.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const css = readFileSync(join(ROOT, 'styles.css'), 'utf8');
const app = readFileSync(join(ROOT, 'app.mjs'), 'utf8');

function mockFile(value) {
  const content = typeof value === 'string' ? value : JSON.stringify(value);
  return { size: new TextEncoder().encode(content).length, text: async () => content };
}

describe('P15L browser-independent local-file controller', () => {
  it('initializes with English copy', () => assert.equal(initialState().locale, 'en'));
  it('starts without a manifest', () => assert.equal(initialState().current, null));
  it('starts without completed audit findings', () => assert.deepEqual(initialState().allFindings, []));
  it('starts with filters showing every finding', () => assert.equal(initialState().level, 'all'));
  it('starts with help collapsed', () => assert.equal(initialState().helpOpen, false));
  it('starts with source inventory collapsed', () => assert.equal(initialState().sourcesOpen, false));
  it('formats the date as YYYY-MM-DD', () => assert.equal(preferredDate(new Date('2026-11-20T12:00:00Z')), '2026-11-20'));
  it('accepts a valid as-of date and bounded age', () => assert.equal(validPolicy(POLICY.asOf, '365'), true));
  it('accepts source age of zero', () => assert.equal(validPolicy(POLICY.asOf, '0'), true));
  it('rejects an invalid as-of date', () => assert.equal(validPolicy('2026-02-30', '365'), false));
  it('rejects negative max-age', () => assert.equal(validPolicy(POLICY.asOf, '-1'), false));
  it('rejects fractional max-age', () => assert.equal(validPolicy(POLICY.asOf, '1.2'), false));
  it('rejects an age beyond configured bounds', () => assert.equal(validPolicy(POLICY.asOf, '3651'), false));
  it('rejects blank max-age', () => assert.equal(validPolicy(POLICY.asOf, ''), false));
  it('loads a bounded local JSON file', async () => {
    assert.deepEqual(await readLocalFile(mockFile(manifest())), manifest());
  });
  it('rejects a missing local file', async () => {
    await assert.rejects(() => readLocalFile(null), /FILE_MISSING/);
  });
  it('rejects an empty file', async () => {
    await assert.rejects(() => readLocalFile(mockFile('')), /FILE_SIZE/);
  });
  it('rejects JSON with invalid syntax', async () => {
    await assert.rejects(() => readLocalFile(mockFile('{bad-json')), /FILE_JSON/);
  });
  it('rejects file exceeding byte-size cap', async () => {
    await assert.rejects(() => readLocalFile(mockFile(' '.repeat(LIMITS.bytes + 1))), /FILE_SIZE/);
  });
  it('rejects a malformed file-size property', async () => {
    await assert.rejects(() => readLocalFile({ size: 'big', text: async () => '{}' }), /FILE_SIZE/);
  });
  it('supports local audit without a prior publication', () => {
    const result = reviewInputs(manifest(), null, POLICY);
    assert.equal(result.audit.ok, true);
    assert.equal(result.comparison, null);
  });
  it('supports comparison of two valid local files', () => {
    const result = reviewInputs(manifest(), manifest(), POLICY);
    assert.equal(result.comparison.ok, true);
  });
  it('returns blocking findings when current file is invalid', () => {
    const input = manifest(); input.sources[0].licence = 'private';
    const result = reviewInputs(input, null, POLICY);
    assert.equal(result.audit.ok, false);
    assert.ok(result.findings.length > 0);
  });
  it('keeps all source observations unchanged during review', () => {
    const input = manifest(); const saved = JSON.stringify(input);
    reviewInputs(input, null, POLICY);
    assert.equal(JSON.stringify(input), saved);
  });
  it('writes text into DOM nodes using textContent, not HTML parsing', () => {
    const calls = [];
    const mock = { createElement: tag => ({ tag, set textContent(value) { calls.push(value); }, className: '' }) };
    const node = createNode(mock, 'span', '<script>evil()</script>');
    assert.equal(node.tag, 'span');
    assert.equal(calls[0], '<script>evil()</script>');
  });
});

describe('P15L offline page integration contract', () => {
  it('declares a local module entry point', () => assert.match(html, /src="\.\/app\.mjs"/));
  it('loads a relative stylesheet only', () => assert.match(html, /href="\.\/styles\.css"/));
  it('contains no remote scripts', () => assert.doesNotMatch(html, /<script[^>]+src="https?:/i));
  it('contains no third-party map tiles', () => assert.doesNotMatch(html, /tile\.openstreetmap|mapbox|maps\.googleapis/i));
  it('contains no external forms', () => assert.doesNotMatch(html, /<form[^>]+action=/i));
  it('accepts JSON rather than an unbounded arbitrary upload', () => assert.match(html, /accept="\.json,application\/json"/));
  it('uses an explicit current file label', () => assert.match(html, /for="current"/));
  it('uses an explicit old file label', () => assert.match(html, /for="previous-file"/));
  it('uses native input type file', () => assert.match(html, /type="file"/));
  it('uses native input type date', () => assert.match(html, /type="date"/));
  it('uses numeric maximum source age', () => assert.match(html, /id="max-age"[^>]+type="number"/));
  it('provides a skip link to results', () => assert.match(html, /href="#results"/));
  it('provides a language selection control', () => assert.match(html, /<select id="locale"/));
  it('has an English document language default', () => assert.match(html, /<html lang="en"/));
  it('provides an announcement region for review outcome', () => assert.match(html, /id="review-status" role="status"/));
  it('provides an announcement region for errors', () => assert.match(html, /id="input-status" role="status"/));
  it('contains a keyboard-focusable results region', () => assert.match(html, /id="results"[^>]*tabindex="-1"/));
  it('provides native labelled filtering controls', () => {
    for (const id of ['level-filter', 'category-filter', 'finding-search', 'page-size']) {
      assert.ok(html.includes(`for="${id}"`));
    }
  });
  it('provides an accessible disclosure state for help', () => assert.match(html, /id="toggle-help"[^>]+aria-expanded="false"/));
  it('provides an accessible disclosure state for sources', () => assert.match(html, /id="toggle-sources"[^>]+aria-expanded="false"/));
  it('uses native buttons rather than role=button elements', () => assert.doesNotMatch(html, /role="button"/));
  it('provides local report export controls', () => assert.match(html, /id="export-json"[\s\S]+id="export-csv"/));
  it('does not register cron-like scheduling', () => assert.doesNotMatch(app, /setInterval\(|cron|scheduleTask/));
  it('does not use network fetch', () => assert.doesNotMatch(app, /\bfetch\s*\(/));
  it('does not write local storage', () => assert.doesNotMatch(app, /localStorage|sessionStorage/));
  it('does not transmit browser beacons', () => assert.doesNotMatch(app, /sendBeacon/));
  it('uses actual localized dictionary keys', () => {
    for (const [, key] of [...html.matchAll(/data-i18n="([^"]+)"/g)]) assert.ok(copyKeys('en').includes(key), key);
  });
  it('specifies at least 44px minimum heights for controls', () => assert.match(css, /min-height:\s*44px/));
  it('specifies at least 44px minimum widths for controls', () => assert.match(css, /min-width:\s*44px/));
  it('provides focus-visible indicators', () => assert.match(css, /:focus-visible\s*\{[^}]+outline:\s*3px/));
  it('respects reduced motion preferences', () => assert.match(css, /prefers-reduced-motion:\s*reduce/));
  it('includes a narrow-screen responsive layout', () => assert.match(css, /max-width:\s*45rem/));
  it('keeps the initial source inventory collapsed', () => assert.match(html, /id="source-content" hidden/));
  it('keeps change results hidden until comparison exists', () => assert.match(html, /id="changes-panel"[^>]+hidden/));
  it('keeps exports hidden until a review completes', () => assert.match(html, /id="exports"[^>]+hidden/));
  it('uses no external fonts or stylesheets', () => assert.doesNotMatch(css, /@import|url\(https?:/));
  it('uses no inline script or dynamic HTML injection', () => assert.doesNotMatch(app, /innerHTML\s*=/));
  it('retains a conspicuous limitation statement', () => assert.match(html, /does not determine route suitability/));
  it('uses a single local module folder', () => {
    const paths = readdirSync(ROOT);
    assert.ok(paths.includes('schema.mjs'));
    assert.ok(paths.includes('compare.mjs'));
    assert.ok(paths.includes('report.mjs'));
    assert.ok(paths.includes('copy.mjs'));
  });
});
