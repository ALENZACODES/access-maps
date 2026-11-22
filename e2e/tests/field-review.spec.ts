import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {gzipSync} from 'node:zlib';
import AxeBuilder from '@axe-core/playwright';
import {test as runner, expect, type Page} from '@playwright/test';

type Lang = 'en' | 'fr';
type Side = 'before' | 'after';

const test = runner.extend<object, {reviewURL: string}>({
  reviewURL: [async ({}, use) => {
    const directory = new URL('../../docs/attribution/', import.meta.url);
    const server = createServer(async (req, res) => {
      const name = (req.url ?? '').split('?')[0]?.slice(1) ?? '';
      if (!/^field-review(?:-[a-z]+)?\.(?:html|css|mjs)$/.test(name)) {
        res.writeHead(404).end();
        return;
      }
      try {
        const bytes = await readFile(new URL(name, directory));
        const mime = name.endsWith('.css') ? 'text/css' : name.endsWith('.html') ? 'text/html' : 'text/javascript';
        res.writeHead(200, {'content-type': mime + '; charset=utf-8', 'cache-control': 'no-store'}).end(bytes);
      } catch {
        res.writeHead(404).end();
      }
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    try {
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      await use(`http://127.0.0.1:${address.port}/field-review.html`);
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }, {scope: 'worker'}],
});

function entry(value: string | number | number[][], source = 'source-one') {
  return {value, source_id: source, licence: 'terms-1', retrieved_at: '2026-03-11', tier: 0};
}

function place(id: string, fields: Record<string, object>, region = 'sector') {
  return {id, tranche: 'venue', region, fields};
}

async function at(page: Page, url: string, lang: Lang) {
  await page.goto(url + '?lang=' + lang);
  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
}

async function upload(page: Page, side: Side, name: string, bytes: Buffer) {
  const type = name.endsWith('.gz') ? 'application/gzip' : 'application/json';
  await page.locator('#' + side + '-file').setInputFiles({name, mimeType: type, buffer: bytes});
}

async function load(page: Page, side: Side, data: unknown, name = side + '.json') {
  await upload(page, side, name, Buffer.from(JSON.stringify(data)));
  await expect(page.locator('#' + side + '-status')).toContainText(name);
}

async function download(page: Page, lang: Lang) {
  const waiting = page.waitForEvent('download');
  await page.locator('#download').click();
  const result = await waiting;
  expect(result.suggestedFilename()).toBe('field-review-' + lang + '.txt');
  const stream = await result.createReadStream();
  assert.ok(stream);
  const pieces: Buffer[] = [];
  for await (const piece of stream) pieces.push(Buffer.from(piece));
  return new TextDecoder('utf-8', {fatal: true}).decode(Buffer.concat(pieces));
}

async function values(page: Page) {
  await load(page, 'before', [place('b-02', {width: entry(0)})]);
  await load(page, 'after', [place('b-02', {width: entry('0', 'source-two')})]);
  await expect(page.locator('#ready')).toBeVisible();
  await page.locator('#rows summary').first().click();
}

test('fallback exposes bilingual instructions with French document language', async ({browser, reviewURL}) => {
  const context = await browser.newContext({javaScriptEnabled: false});
  try {
    const page = await context.newPage();
    await page.goto(reviewURL + '?lang=fr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.getByRole('heading', {level: 1})).toHaveText('Comparer les champs cartographiques');
    await expect(page.locator('#fallback p[lang=en]')).toContainText('on this device');
    await expect(page.locator('#workspace')).toBeHidden();
    await expect(page.getByRole('main')).toBeVisible();
  } finally {
    await context.close();
  }
});

for (const lang of ['en', 'fr'] as const) {
  test('exposes both sources and typed values at 320 px in ' + lang, async ({page, reviewURL}) => {
    await page.setViewportSize({width: 320, height: 820});
    await page.emulateMedia({colorScheme: lang === 'fr' ? 'dark' : 'light'});
    await at(page, reviewURL, lang);
    await values(page);
    const earlier = lang === 'fr' ? 'Premier fichier' : 'Earlier file';
    const later = lang === 'fr' ? 'Second fichier' : 'Later file';
    await expect(page.getByLabel(earlier, {exact: true})).toHaveAttribute('aria-describedby', /before-status/);
    await expect(page.getByLabel(later, {exact: true})).toHaveAttribute('aria-describedby', /after-status/);
    await expect(page.locator('#rows')).toContainText('source-one');
    await expect(page.locator('#rows')).toContainText('source-two');
    await expect(page.locator('#rows')).toContainText('terms-1');
    await expect(page.locator('#rows')).toContainText('2026-03-11');
    const tree = await page.getByRole('main').ariaSnapshot();
    for (const name of [earlier, later, 'source-one', 'source-two', lang === 'fr' ? 'Nombre' : 'Number', lang === 'fr' ? 'Texte' : 'Text']) {
      expect(tree).toContain(name);
    }
    const measurements = await page.evaluate(() => {
      const controls = [...document.querySelectorAll<HTMLElement>('a, button, input, select, summary')];
      const undersized = controls.filter(el => {
        const {width, height} = el.getBoundingClientRect();
        return width > 0 && height > 0 && (width < 44 || height < 44);
      }).map(el => el.id || el.textContent);
      return {undersized, overflows: document.documentElement.scrollWidth > innerWidth};
    });
    expect(measurements).toEqual({undersized: [], overflows: false});
    const scan = await new AxeBuilder({page}).analyze();
    expect(scan.violations.map(({id, nodes}) => ({id, targets: nodes.map(n => n.target)}))).toEqual([]);
  });
}

test('keyboard skip, language selection and disclosure retain a visible focus indicator', async ({page, reviewURL}) => {
  await at(page, reviewURL, 'en');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', {name: 'Skip to main content'});
  await expect(skip).toBeFocused();
  expect(await skip.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#language')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Premier fichier', {exact: true})).toBeFocused();
  await load(page, 'before', place('x', {width: entry(1)}));
  await load(page, 'after', place('x', {width: entry('UNKNOWN')}));
  const summary = page.locator('#rows summary').first();
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#rows details').first()).toHaveAttribute('open', '');
  await expect(summary).toBeFocused();
  expect(await summary.evaluate(el => parseFloat(getComputedStyle(el).outlineWidth))).toBeGreaterThanOrEqual(2);
  await expect(page.locator('#rows')).toContainText('Valeur renseignée devenue UNKNOWN');
});

test('applies combined filters and exports every selected result across display pages', async ({page, reviewURL}) => {
  await at(page, reviewURL, 'en');
  const records = Array.from({length: 35}, (_, i) => {
    const key = 'entry-' + String(i).padStart(2, '0');
    return place(key, {ramp: entry('UNKNOWN'), width: entry('wide')}, 'côté');
  });
  const changed = records.map((row, i) => place(row.id, {
    ramp: entry('reported', i === 0 ? 'outside' : 'source-new'),
    width: entry('narrow', 'source-new'),
  }, 'côté'));
  await load(page, 'after', changed);
  await expect(page.locator('#ready')).toBeHidden();
  await expect(page.locator('#needed')).toContainText('earlier file');
  const lines = records.map(row => JSON.stringify(row)).join('\n');
  await upload(page, 'before', 'baseline.ndjson.gz', gzipSync(lines));
  await expect(page.locator('#ready')).toBeVisible();
  await page.locator('#field').fill('ramp');
  await page.locator('#source').fill('source-new');
  await page.locator('#query').fill('COTE');
  await page.locator('#kind').selectOption('reported');
  await page.locator('#side').selectOption('both');
  await expect(page.locator('#pending')).toBeVisible();
  await expect(page.locator('#download')).toBeDisabled();
  await page.locator('#apply').click();
  await expect(page.locator('#summary')).toContainText('34 of 70');
  await expect(page.locator('#rows')).toContainText('entry-01');
  await expect(page.locator('#rows')).not.toContainText('entry-34');
  const text = await download(page, 'en');
  expect(text).toContain('entry-01');
  expect(text).toContain('entry-34');
  expect(text).not.toContain('entry-00');
  expect(text).not.toContain('narrow');
  expect(text).toContain('source-new');
  expect(text).toContain('terms-1');
  expect(text).toContain('UNKNOWN');
  await page.locator('#next').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#page-position')).toBeFocused();
  await expect(page.locator('#rows')).not.toContainText('entry-01');
  await page.locator('#previous').click();
  await expect(page.locator('#rows')).toContainText('entry-01');
  await page.locator('#reset').click();
  await expect(page.locator('#summary')).toContainText('70 of 70');
});

test('keeps the successful file when a replacement fails, then clears one side independently', async ({page, reviewURL}) => {
  await at(page, reviewURL, 'fr');
  await load(page, 'before', place('id', {step_count: entry(0)}), 'ancien.json');
  await load(page, 'after', place('id', {step_count: entry('UNKNOWN')}), 'nouveau.json');
  await expect(page.locator('#ready')).toBeVisible();
  const baseline = await download(page, 'fr');
  const duplicate = JSON.stringify(place('id', {step_count: entry(2)}));
  await upload(page, 'after', 'double.ndjson', Buffer.from(duplicate + '\n' + duplicate));
  const error = page.locator('#after-error');
  await expect(error).toHaveAttribute('role', 'alert');
  await expect(error).toContainText('Enregistrement ou ligne 2');
  await expect(error).toContainText('double.ndjson');
  await expect(page.locator('#after-status')).toContainText('nouveau.json');
  expect(await download(page, 'fr')).toBe(baseline);
  await page.locator('#after-clear').click();
  await expect(page.locator('#ready')).toBeHidden();
  await expect(error).toBeEmpty();
  await expect(page.locator('#before-status')).toContainText('ancien.json');
  await expect(page.locator('#after-file')).toBeFocused();
  await load(page, 'after', place('id', {}), 'vide.json');
  const replacement = await download(page, 'fr');
  expect(replacement).not.toEqual(baseline);
  expect(replacement).toContain('Champ présent seulement dans le premier fichier');
});

test('a language switch keeps the pair, active filter and draft while changing the report language', async ({page, reviewURL}) => {
  await at(page, reviewURL, 'en');
  await load(page, 'before', place('id', {width: entry(1), ramp: entry(2)}));
  await load(page, 'after', place('id', {width: entry(3), ramp: entry(4)}));
  await page.locator('#field').fill('width');
  await page.locator('#apply').click();
  await expect(page.locator('#summary')).toContainText('1 of 2');
  await page.locator('#field').fill('ramp');
  await page.locator('#language').click();
  await expect(page).toHaveTitle('Comparer les champs cartographiques');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.locator('#field')).toHaveValue('ramp');
  await expect(page.locator('#pending')).toBeVisible();
  await expect(page.locator('#before-status')).toContainText('before.json');
  await expect(page.locator('#rows')).toContainText('width');
  await page.locator('#apply').click();
  await expect(page.locator('#rows')).toContainText('ramp');
  const text = await download(page, 'fr');
  expect(text).toContain('ramp');
  expect(text).not.toContain('width');
  expect(text).toContain('\u00a0:');
});

test('unknown evidence and a missing field remain distinguishable on the comparison page', async ({page, reviewURL}) => {
  await at(page, reviewURL, 'en');
  await load(page, 'before', place('id', {ramp: {value: 'UNKNOWN'}}));
  await load(page, 'after', place('id', {width: entry(0)}));
  await expect(page.locator('#ready')).toBeVisible();
  const items = page.locator('#rows > .review-list > li');
  await expect(items).toHaveCount(2);
  const removed = items.filter({hasText: 'ramp'});
  await removed.locator('summary').click();
  await expect(removed).toContainText('Field absent from this record.');
  await expect(removed).toContainText('UNKNOWN');
  const present = items.filter({hasText: 'width'});
  await present.locator('summary').click();
  await expect(present).toContainText('Field absent from this record.');
  await expect(present).toContainText('Number');
  await expect(present).toContainText('source-one');
});

test('navigates an ordered geometry independently on each side and keeps its position across languages', async ({page, reviewURL}) => {
  const points = Array.from({length: 53}, (_, i) => [i, -i]);
  const revised = points.map((point, i) => i === 52 ? [0, 1] : point);
  await at(page, reviewURL, 'en');
  await load(page, 'before', {id: 'line', tranche: 'path', region: 'sector', fields: {line: entry(points)}});
  await load(page, 'after', {id: 'line', tranche: 'path', region: 'sector', fields: {line: entry(revised)}});
  const row = page.locator('#rows .review-list > li').first();
  await row.locator('summary').first().click();
  const left = row.locator('[data-side=before] details.geometry');
  const right = row.locator('[data-side=after] details.geometry');
  await left.locator('summary').click();
  await right.locator('summary').click();
  await expect(left.locator('li')).toHaveCount(24);
  await left.getByRole('button', {name: 'Next coordinates'}).focus();
  await page.keyboard.press('Enter');
  await expect(left.locator('p')).toBeFocused();
  await expect(left.locator('ol')).toHaveAttribute('start', '25');
  await expect(right.locator('ol')).toHaveAttribute('start', '1');
  await page.locator('#language').click();
  await expect(left.locator('ol')).toHaveAttribute('start', '25');
  await expect(right.locator('ol')).toHaveAttribute('start', '1');
  await left.getByRole('button', {name: 'Coordonnées suivantes'}).click();
  await expect(left.locator('li')).toHaveCount(5);
  await expect(left.locator('li').last()).toHaveText('52, -52');
  await expect(left.getByRole('button', {name: 'Coordonnées suivantes'})).toBeDisabled();
});

test('an older in-flight read cannot replace a newer successful choice for the same side', async ({page, reviewURL}) => {
  await at(page, reviewURL, 'en');
  await load(page, 'before', place('item', {width: entry(0)}));
  await page.evaluate(() => {
    const original = File.prototype.stream;
    File.prototype.stream = function () {
      if (this.name !== 'held.json') return original.call(this);
      const stream = original.call(this);
      return stream.pipeThrough(new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>({
        async transform(chunk, controller) {
          await new Promise<void>(resolve => {
            window.addEventListener('allow-held-read', () => resolve(), {once: true});
            document.documentElement.dataset.held = 'reading';
          });
          controller.enqueue(chunk);
        },
      }));
    };
  });
  await upload(page, 'after', 'held.json', Buffer.from(JSON.stringify(place('item', {width: entry(1, 'held-source')}))));
  await expect(page.locator('html')).toHaveAttribute('data-held', 'reading');
  await load(page, 'after', place('item', {width: entry(2, 'new-source')}), 'chosen.json');
  await expect(page.locator('#ready')).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('allow-held-read')));
  const report = await download(page, 'en');
  await expect(page.locator('#after-status')).toContainText('chosen.json');
  expect(report).toContain('new-source');
  expect(report).not.toContain('held-source');
});

test('shows different explanations for identical snapshots, empty snapshots, and an empty filter result', async ({page, reviewURL}) => {
  await at(page, reviewURL, 'en');
  await load(page, 'before', []);
  await load(page, 'after', []);
  await expect(page.locator('#rows')).toContainText('Both files contain zero records');
  const row = place('shared', {width: entry('UNKNOWN')});
  await load(page, 'before', row);
  await load(page, 'after', row);
  await expect(page.locator('#rows')).toContainText('All rows');
  await page.locator('#kind').selectOption('all');
  await page.locator('#apply').click();
  await expect(page.locator('#rows')).toContainText('Unchanged field');
  await page.locator('#query').fill('does-not-match');
  await page.locator('#apply').click();
  await expect(page.locator('#rows')).toContainText('Try another filter');
  const report = await download(page, 'en');
  expect(report).not.toContain('terms-1');
});

test('reads joined gzip members across a split text character and rejects a corrupt trailing member atomically', async ({page, reviewURL}) => {
  await at(page, reviewURL, 'fr');
  await load(page, 'before', []);
  const first = JSON.stringify(place('premier', {width: entry(0)})) + '\n';
  const second = Buffer.from(JSON.stringify(place('deuxième', {width: entry('été')})));
  const split = second.indexOf(Buffer.from('è')) + 1;
  expect(split).toBeGreaterThan(1);
  const joined = Buffer.concat([
    gzipSync(first),
    gzipSync(second.subarray(0, split)),
    gzipSync(second.subarray(split)),
  ]);
  await upload(page, 'after', 'joint.ndjson.gz', joined);
  await expect(page.locator('#ready')).toBeVisible();
  await expect(page.locator('#after-status')).toContainText('Enregistrements : 2');
  const original = await download(page, 'fr');
  expect(original).toContain('deuxième');
  expect(original).toContain('été');
  const firstChanged = JSON.stringify(place('partial-only', {width: entry(7)})) + '\n';
  const trailing = gzipSync(second);
  const crc = trailing.length - 8;
  trailing.writeUInt32LE((trailing.readUInt32LE(crc) ^ 1) >>> 0, crc);
  await upload(page, 'after', 'incomplet.gz', Buffer.concat([gzipSync(firstChanged), trailing]));
  await expect(page.locator('#after-error')).toContainText('incomplet.gz');
  await expect(page.locator('#after-status')).toContainText('joint.ndjson.gz');
  await expect(page.locator('#rows')).not.toContainText('partial-only');
  expect(await download(page, 'fr')).toBe(original);
});

test('names empty and spacing-only text on both sides of the comparison', async ({page, reviewURL}) => {
  await at(page, reviewURL, 'fr');
  await load(page, 'before', [place('r', {name: entry('')})]);
  await load(page, 'after', [place('r', {name: entry(' \t')})]);
  const row = page.locator('#rows .row-details');
  await row.locator('summary').first().click();
  await expect(row.locator('[data-side=before]')).toContainText('Texte vide');
  await expect(row.locator('[data-side=after]')).toContainText('Caractères d’espacement (2)');
  const report = await download(page, 'fr');
  expect(report).toContain('Valeur\u00a0: ""');
  expect(report).toContain('Valeur\u00a0: " \\t"');
});
