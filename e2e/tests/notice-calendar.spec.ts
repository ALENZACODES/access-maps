import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {createServer, type Server} from 'node:http';
import {dirname, resolve} from 'node:path';
import {gzipSync} from 'node:zlib';
import AxeBuilder from '@axe-core/playwright';
import {expect, test, type Page} from '@playwright/test';

type Locale = 'en' | 'fr';
let server: Server;
let pageURL: string;

test.beforeAll(async ({}, testInfo) => {
  const assets = resolve(dirname(testInfo.file), '../../docs/attribution');
  server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const asset = /^\/(notice-calendar(?:-[a-z-]+)?\.(html|mjs|css))$/.exec(url.pathname);
    const fileName = asset?.[1];
    if (!fileName) {
      response.writeHead(404).end();
      return;
    }
    const media = {html: 'text/html', css: 'text/css', mjs: 'text/javascript'};
    try {
      const bytes = await readFile(resolve(assets, fileName));
      response.writeHead(200, {
        'content-type': media[fileName.slice(fileName.lastIndexOf('.') + 1) as keyof typeof media] + '; charset=utf-8',
        'cache-control': 'no-store',
      }).end(bytes);
    } catch {
      response.writeHead(404).end();
    }
  });
  const listening = once(server, 'listening');
  server.listen(0, '127.0.0.1');
  await listening;
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing local port');
  pageURL = 'http://127.0.0.1:' + address.port + '/notice-calendar.html';
});

test.afterAll(async () => {
  if (server?.listening) {
    const closed = once(server, 'close');
    server.close();
    server.closeAllConnections();
    await closed;
  }
});

async function open(page: Page, lang: Locale) {
  await page.goto(pageURL + '?lang=' + lang);
  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
}

async function openExample(page: Page, lang: Locale = 'en') {
  await open(page, lang);
  await page.locator('#sample').click();
  await expect(page.locator('#results')).toBeVisible();
}

async function applyWindow(page: Page, date: string, days: string, zone: string) {
  await page.locator('#date').fill(date);
  await page.locator('#days').fill(days);
  await page.locator('#zone').selectOption(zone);
  await page.locator('#apply').click();
}

async function reportText(page: Page) {
  const download = page.waitForEvent('download');
  await page.locator('#download').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.txt$/iu);
  const stream = await file.createReadStream();
  if (!stream) throw new Error('Missing report bytes');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function checkTargets(page: Page) {
  const small = await page.locator('a, button, input, select, summary').evaluateAll(elements =>
    elements.flatMap(element => {
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height) return [];
      return box.width < 44 || box.height < 44
        ? [{control: element.id || element.textContent?.trim(), width: box.width, height: box.height}]
        : [];
    }),
  );
  expect(small).toEqual([]);
}

test('retains bilingual instructions and a French document when scripts are disabled', async ({browser}) => {
  const context = await browser.newContext({javaScriptEnabled: false});
  try {
    const page = await context.newPage();
    await page.goto(pageURL + '?lang=fr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('heading', {level: 1})).toHaveText('Calendrier des avis de service');
    await expect(page.locator('#fallback p[lang=en]')).toContainText('Enable browser scripts');
    await expect(page.locator('#fallback p').first()).toContainText('Activez les scripts');
    await expect(page.locator('#workspace')).toBeHidden();
    await expect(page.locator('#language')).toBeHidden();
  } finally {
    await context.close();
  }
});

for (const locale of ['en', 'fr'] as const) {
  test('exposes named controls, source languages and accessible results in ' + locale, async ({page}) => {
    const mobile = locale === 'fr';
    await page.setViewportSize({width: mobile ? 320 : 1152, height: 800});
    await page.emulateMedia({colorScheme: mobile ? 'dark' : 'light'});
    await openExample(page, locale);
    const title = locale === 'fr' ? 'Calendrier des avis de service' : 'Service notice calendar';
    const fileLabel = locale === 'fr' ? 'Choisir un fichier local' : 'Choose a local file';
    await expect(page).toHaveTitle(title);
    await expect(page.getByRole('heading', {name: title, level: 1})).toBeVisible();
    await expect(page.getByLabel(fileLabel)).toHaveAttribute('aria-describedby', 'file-help');
    await expect(page.getByRole('status')).toHaveAttribute('aria-atomic', 'true');
    await expect(page.locator('#unknown summary').first()).toContainText('(1)');
    await expect(page.locator('#outside summary').first()).toContainText('(1)');
    await page.locator('#filters > summary').click();
    await page.locator('#unknown > summary').click();
    await page.locator('#outside > summary').click();
    const original = page.getByText('Practice notice without published times', {exact: true}).first();
    await expect(original).toBeVisible();
    expect(await original.evaluate(el => el.closest('[lang]')?.getAttribute('lang'))).toBe('en');
    const originalFr = page.getByText('Exercice portant sur une période antérieure', {exact: true}).first();
    expect(await originalFr.evaluate(el => el.closest('[lang]')?.getAttribute('lang'))).toBe('fr');
    await original.click();
    await expect(page.locator('#unknown-entries')).toContainText('sample-licence');
    await expect(page.locator('#unknown-entries')).toContainText('2026-03-06');
    await checkTargets(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    expect(overflow).toBe(false);
    const scan = await new AxeBuilder({page}).analyze();
    expect(scan.violations.map(issue => ({id: issue.id, nodes: issue.nodes.map(n => n.target)}))).toEqual([]);
    const tree = await page.getByRole('main').ariaSnapshot();
    expect(tree).toContain(title);
    expect(tree).toContain(fileLabel);
  });
}

test('reaches the skip link, switches language and opens the example using the keyboard', async ({page}) => {
  await open(page, 'en');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', {name: 'Skip to main content'});
  await expect(skip).toBeFocused();
  expect(await skip.evaluate(el => Number.parseFloat(getComputedStyle(el).outlineWidth))).toBeGreaterThanOrEqual(2);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#language')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.getByRole('heading', {name: 'Calendrier des avis de service'})).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Choisir un fichier local')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', {name: 'Explorer un exemple fictif'})).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.locator('#summary')).toContainText('Après filtrage');
  await expect(page.locator('#summary')).toHaveText(/fichier\u00a0: 4/u, {useInnerText: false});
});

test('applies combined filters, excludes unrelated notices from export and restores all groups', async ({page}) => {
  await openExample(page);
  await page.locator('#filters > summary').click();
  await page.getByLabel('Exact stop ID').fill('S-02');
  await page.getByLabel('Search notice text and IDs').fill('MECANIQUE');
  await page.locator('#equipment').selectOption('escalator');
  await expect(page.locator('#pending')).toBeVisible();
  await page.getByRole('button', {name: 'Apply dates and filters'}).click();
  await expect(page.locator('#summary')).toContainText('After filters: 1');
  await expect(page.locator('#unknown-title')).toContainText('(0)');
  await expect(page.locator('#outside-title')).toContainText('(0)');
  const report = await reportText(page);
  expect(report).toContain('Fictional example');
  expect(report).toContain('Identifier: example-02');
  expect(report).not.toContain('Identifier: example-01');
  expect(report).toContain('Source: sample-source');
  expect(report).toContain('Date retrieved: 2026-03-06');
  expect(report).toContain('Evidence tier: 4');
  await page.locator('#reset-filters').click();
  await expect(page.locator('#summary')).toContainText('After filters: 4');
  await expect(page.locator('#unknown-title')).toContainText('(1)');
  await expect(page.locator('#outside-title')).toContainText('(1)');
});

test('reads a gzip snapshot and distinguishes two occurrences of the repeated local hour', async ({page}) => {
  const start = Date.parse('2025-11-02T05:30:00Z') / 1000;
  const row = {
    id: 'repeated-hour',
    header_text: 'Observation locale',
    header_language: 'fr',
    retrieved_at: '2025-11-02',
    active_periods: [{start, end: start + 30}, {start: start + 3600, end: start + 3630}],
  };
  await open(page, 'fr');
  await page.locator('#file').setInputFiles({
    name: 'heures.gz',
    mimeType: 'application/gzip',
    buffer: gzipSync(Buffer.from(JSON.stringify(row))),
  });
  await expect(page.locator('#origin')).toContainText('heures.gz');
  await applyWindow(page, '2025-11-02', '1', 'America/Toronto');
  await expect(page.locator('#entries')).toContainText('Observation locale');
  const report = await reportText(page);
  expect(report).toContain('Identifiant\u00a0: repeated-hour');
  expect(report).toContain('2025-11-02T05:30:00Z');
  expect(report).toContain('2025-11-02T06:30:00Z');
  expect(report).toMatch(/[−-]04:00/u);
  expect(report).toMatch(/[−-]05:00/u);
  expect(report).toContain('Source\u00a0: UNKNOWN');
  expect(report).toContain('Licence\u00a0: UNKNOWN');
  expect(report).toContain('Niveau de preuve\u00a0: UNKNOWN');
});

test('replaces file errors and results coherently and clears local contents on request', async ({page}) => {
  await openExample(page);
  await page.locator('#file').setInputFiles({
    name: 'invalid.ndjson',
    mimeType: 'application/x-ndjson',
    buffer: Buffer.from('{"id":"part-one"}\n{"id":"part-one"}'),
  });
  await expect(page.getByRole('alert')).toContainText('repeats a notice ID');
  await expect(page.getByRole('alert')).toContainText('2');
  await expect(page.locator('#origin')).not.toContainText('invalid.ndjson');
  const next = {id: 'replacement', header_text: 'Remplacement', header_language: 'fr'};
  await page.locator('#file').setInputFiles({
    name: 'replacement.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([next])),
  });
  await expect(page.locator('#origin')).toContainText('replacement.json');
  await expect(page.locator('#summary')).toContainText('Notices in file: 1');
  await expect(page.getByRole('alert')).toBeEmpty();
  const report = await reportText(page);
  expect(report).toContain('Identifier: replacement');
  expect(report).not.toContain('example-');
  await page.locator('#clear').click();
  await expect(page.locator('#loaded')).toBeHidden();
  await expect(page.locator('#origin')).toBeEmpty();
  await expect(page.getByRole('status')).toContainText('cleared');
});

test('checks the date range before changing the displayed day or exported selection', async ({page}) => {
  await openExample(page);
  await applyWindow(page, '2026-03-07', '2', 'UTC');
  await expect(page.locator('#previous-day')).toBeDisabled();
  await page.locator('#next-day').click();
  await expect(page.locator('#next-day')).toBeDisabled();
  await expect(page.locator('#entries')).toContainText('Practice lift notice with two periods');
  await page.locator('#days').fill('32');
  await page.locator('#apply').click();
  await expect(page.getByRole('alert')).not.toBeEmpty();
  await expect(page.locator('#pending')).toBeVisible();
  await page.locator('#days').fill('1');
  await page.locator('#apply').click();
  await expect(page.getByRole('alert')).toBeEmpty();
  await expect(page.locator('#next-day')).toBeDisabled();
  await expect(page.locator('#previous-day')).toBeDisabled();
  const report = await reportText(page);
  expect(report).toContain('Selected dates: 2026-03-07\n');
});

test('keyboard pagination keeps focus at the new slice and reports notices beyond that slice', async ({page}) => {
  await open(page, 'en');
  const epoch = Date.parse('2026-02-19T12:00:00Z') / 1000;
  const rows = Array.from({length: 26}, (_, index) => {
    const number = String(index + 1).padStart(2, '0');
    return {
      id: 'item-' + number,
      header_text: 'Notice ' + number,
      header_language: 'en',
      source_id: 'sample-source',
      licence: 'sample-licence',
      retrieved_at: '2026-02-19',
      tier: 4,
      active_periods: [{start: epoch, end: epoch + 60}],
    };
  });
  await page.locator('#file').setInputFiles({
    name: 'collection.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(rows)),
  });
  await expect(page.locator('#origin')).toContainText('collection.json');
  await applyWindow(page, '2026-02-19', '1', 'UTC');
  const group = page.locator('#entries');
  await expect(group.getByText('Notice 01', {exact: true})).toBeVisible();
  await expect(group.getByText('Notice 26', {exact: true})).toHaveCount(0);
  await expect(group.getByRole('button', {name: 'Previous notices'})).toBeDisabled();
  const next = group.getByRole('button', {name: 'Next notices'});
  await next.focus();
  await page.keyboard.press('Enter');
  await expect(group.getByText('Showing 13–24 of 26.')).toBeFocused();
  await expect(group.getByText('Notice 13', {exact: true})).toBeVisible();
  await next.click();
  await expect(group.getByText('Showing 25–26 of 26.')).toBeFocused();
  await expect(next).toBeDisabled();
  await expect(group.getByText('Notice 26', {exact: true})).toBeVisible();
  await group.getByRole('button', {name: 'Previous notices'}).click();
  await expect(group.getByText('Showing 13–24 of 26.')).toBeFocused();
  const report = await reportText(page);
  for (const row of rows) {
    expect(report.split('Identifier: ' + row.id + '\n')).toHaveLength(2);
  }
});

test('switching language preserves the displayed date, disclosures, and unapplied filters', async ({page}) => {
  await openExample(page);
  await page.locator('#next-day').click();
  await expect(page.locator('#day-heading')).toBeFocused();
  const selectedDay = await page.locator('#shown-day').inputValue();
  await page.locator('#filters > summary').click();
  await page.getByLabel('Exact route ID').fill('R-02');
  await expect(page.locator('#download')).toBeDisabled();
  await page.locator('#unknown > summary').click();
  await page.locator('#unknown-entries summary').click();
  await page.getByRole('button', {name: 'Français'}).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page).toHaveURL(/\blang=fr\b/);
  await expect(page.getByRole('button', {name: 'English'})).toBeFocused();
  await expect(page.locator('#shown-day')).toHaveValue(selectedDay);
  await expect(page.getByLabel('Identifiant exact de la ligne')).toHaveValue('R-02');
  await expect(page.locator('#unknown-entries').getByText('sample-licence')).toBeVisible();
  await expect(page.locator('#download')).toBeDisabled();
  await page.locator('#apply').click();
  await expect(page.locator('#results-heading')).toBeFocused();
  await expect(page.locator('#summary')).toContainText('Après filtrage : 1');
  await expect(page.locator('#download')).toBeEnabled();
});

test('ignores completion of an earlier file read after the user clears the calendar', async ({page}) => {
  await openExample(page);
  // Dispatch an ordinary local file selection; control only the delivery
  // of its bytes, so cancellation can be exercised without a timing guess.
  await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('#file');
    if (!input) throw new Error('Missing file input');
    const text = '{"id":"old-read","header_text":"Older notice"}';
    const file = new File([text], 'old.json', {type: 'application/json'});
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    const old = input.files[0];
    if (!old) throw new Error('Missing file');
    Object.defineProperty(old, 'stream', {
      value: () => new ReadableStream<Uint8Array>({
        start(controller) {
          document.documentElement.dataset.readWaiting = 'yes';
          window.addEventListener('deliver-notice-bytes', () => {
            controller.enqueue(new TextEncoder().encode(text));
            controller.close();
          }, {once: true});
        },
      }),
    });
    input.dispatchEvent(new Event('change', {bubbles: true}));
  });
  await expect(page.locator('html')).toHaveAttribute('data-read-waiting', 'yes');
  await page.locator('#clear').click();
  await expect(page.locator('#file')).toBeFocused();
  // The rendering opportunity follows the microtasks queued by closing the
  // stream, including decoding and the completion handler for the selection.
  await page.evaluate(() => new Promise<void>(resolve => {
    window.dispatchEvent(new Event('deliver-notice-bytes'));
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  await expect(page.locator('#loaded')).toBeHidden();
  await expect(page.locator('#origin')).toBeEmpty();
  await expect(page.getByRole('status')).toContainText('cleared');
  await expect(page.getByRole('alert')).toBeEmpty();
});

test('opens on the latest retrieval day or the included side of an end-only period', async ({page}) => {
  await open(page, 'en');
  const epoch = Date.parse('2025-06-10T12:00:00Z') / 1000;
  const rows = [
    {id: 'newer', retrieved_at: '2026-05-08', active_periods: [{start: epoch}]},
    {id: 'older', retrieved_at: '2026-05-07'},
  ];
  await page.locator('#file').setInputFiles({
    name: 'dated.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(rows)),
  });
  await expect(page.locator('#date')).toHaveValue('2026-05-08');
  const midnight = Date.parse('2026-02-12T05:00:00Z') / 1000;
  const endOnly = [{id: 'end-only', header_text: 'Fin de la période', active_periods: [{end: midnight}]}];
  await page.locator('#file').setInputFiles({
    name: 'end-only.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(endOnly)),
  });
  await expect(page.locator('#date')).toHaveValue('2026-02-11');
  await expect(page.locator('#entries')).toContainText('Fin de la période');
  await page.locator('#next-day').click();
  await expect(page.locator('#entries')).toContainText('No matching notice');
});

test('preserves a source header as text and leaves its unknown language unspecified', async ({page}) => {
  const notice = {
    id: 'unlabelled',
    header_text: '<em>Local notice</em>',
    active_periods: [],
  };
  await open(page, 'fr');
  await page.locator('#file').setInputFiles({
    name: 'notice.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(notice)),
  });
  await page.locator('#unknown-title').click();
  const summary = page.locator('#unknown-entries details > summary');
  await expect(summary).toHaveText(notice.header_text);
  await expect(summary.locator('bdi')).toHaveAttribute('lang', '');
  await expect(summary.locator('em')).toHaveCount(0);
  await summary.click();
  await expect(page.locator('#unknown-entries dd').filter({hasText: 'UNKNOWN'}).first()).toBeVisible();
});
