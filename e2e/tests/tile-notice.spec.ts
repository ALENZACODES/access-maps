import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test as base, type Page } from '@playwright/test';

const assetRoot = new URL('../../docs/attribution/', import.meta.url);
const runtimeAssets = new Map([
  ['tile-notice.html', 'text/html; charset=utf-8'],
  ['tile-notice.css', 'text/css; charset=utf-8'],
  ...['page', 'archive', 'position', 'sources', 'labels', 'report'].map(
    name => ['tile-notice-' + name + '.mjs', 'text/javascript; charset=utf-8'] as const,
  ),
]);

// Serve the exact release modules. This also catches accidental runtime imports
// of files that are only available in a development installation.
const test = base.extend<object, { inspector: string }>({
  inspector: [async ({}, use) => {
    const server = createServer(async (request, response) => {
      const name = new URL(request.url ?? '/', 'http://localhost').pathname.slice(1);
      const type = runtimeAssets.get(name);
      if (!type) {
        response.writeHead(404).end();
        return;
      }
      try {
        response.writeHead(200, { 'Content-Type': type });
        response.end(await readFile(new URL(name, assetRoot)));
      } catch {
        response.destroy();
      }
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Invalid test listener');
      await use('http://127.0.0.1:' + address.port + '/tile-notice.html');
    } finally {
      await new Promise<void>(resolve => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
    }
  }, { scope: 'worker' }],
});

type Feature = Record<string, string | number | boolean>;
type Tile = { z: number; x: number; y: number; bytes: Uint8Array };
type TestArchive = (options: {
  tiles: Tile[]; metadata: Record<string, string>; minZoom: number; maxZoom: number;
  gzipIndex: boolean; gzipTiles: boolean; leafSize: number;
}) => Uint8Array;
type MakeTile = (layers: { name: string; features: Feature[] }[]) => Uint8Array;

const credit = '© Local sample: «keep this!» <b>literal</b>';
const sample = {
  id: 'sample-a', name: 'Survey excerpt', licence_id: 'sample permission',
  retrieved_at: '2025-01-30', tier: 0, attribution: 'Credit <em>as supplied</em>',
};
const ids = Array.from({ length: 15 }, (_, i) => 'group-' + String(i + 1).padStart(2, '0'));

async function testFile(name = 'sample.pmtiles', archiveName = 'Local selection') {
  const { testArchive } = await import(new URL('tile-notice-archive-fixture.mjs', assetRoot).href) as { testArchive: TestArchive };
  const { makeVectorTile } = await import(new URL('tile-notice-fixture.mjs', assetRoot).href) as { makeVectorTile: MakeTile };
  const detail = makeVectorTile([
    { name: 'lines', features: [{ source_id: sample.id }, { source_id: sample.id }, {}] },
    { name: 'points', features: ids.map(source_id => ({ source_id })) },
  ]);
  const empty = makeVectorTile([{ name: 'lines', features: [] }]);
  const buffer = testArchive({
    metadata: { name: archiveName, attribution: credit }, minZoom: 0, maxZoom: 1,
    gzipIndex: true, gzipTiles: true, leafSize: 1,
    tiles: [{ z: 0, x: 0, y: 0, bytes: detail }, { z: 1, x: 0, y: 0, bytes: empty }],
  });
  return { name, mimeType: 'application/octet-stream', buffer: Buffer.from(buffer) };
}

async function registry(page: Page, sources: unknown[], name = 'sample.json') {
  const file = { name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ sources })) };
  await page.locator('#registry-file').setInputFiles(file);
}

async function openSample(page: Page, url: string, lang: 'en' | 'fr') {
  await page.goto(url + '?lang=' + lang);
  await expect(page.locator('#workspace')).toBeVisible();
  await page.locator('#archive-file').setInputFiles(await testFile());
  await expect(page.locator('#position')).toHaveText(/0\/0\/0$/);
}

async function downloadedReport(page: Page) {
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#download').click();
  const download = await downloadEvent;
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Missing report stream');
  const parts: Buffer[] = [];
  for await (const part of stream) parts.push(Buffer.from(part));
  return { name: download.suggestedFilename(), text: Buffer.concat(parts).toString('utf8') };
}

const audits = [
  { lang: 'en', width: 1100, scheme: 'light', title: 'Tile sources', fileLabel: 'Vector tile archive',
    lookup: 'Inspect tile', export: 'Download tile source report', other: 'Français' },
  { lang: 'fr', width: 320, scheme: 'dark', title: 'Sources d’une tuile', fileLabel: 'Archive de tuiles vectorielles',
    lookup: 'Examiner la tuile', export: 'Télécharger le rapport des sources de la tuile', other: 'English' },
] as const;

for (const screen of audits) {
  test('accessible controls and populated result in ' + screen.lang, async ({ page, inspector }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: screen.width, height: 840 });
    await page.emulateMedia({ colorScheme: screen.scheme });
    await openSample(page, inspector, screen.lang);
    await registry(page, [sample]);
    await expect(page.locator('#registry-status')).toContainText('sample.json');
    await expect(page.locator('html')).toHaveAttribute('lang', screen.lang);
    await expect(page.getByRole('heading', { level: 1, name: screen.title })).toBeVisible();
    await expect(page.getByRole('button', { name: screen.lookup })).toBeEnabled();
    await expect(page.getByRole('button', { name: screen.export })).toBeEnabled();
    await expect(page.getByLabel(screen.fileLabel, { exact: true })).toHaveAccessibleName(screen.fileLabel);
    await expect(page.getByRole('button', { name: screen.other })).toBeVisible();
    await expect(page.locator('#groups')).toContainText(sample.name);

    const layout = await page.evaluate(() => {
      const small = Array.from(document.querySelectorAll<HTMLElement>('button, input, select, a'))
        .filter(el => el.getClientRects().length)
        .filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.width < 44 || rect.height < 44;
        }).map(el => el.id || el.tagName);
      const wide = document.documentElement.scrollWidth > innerWidth;
      return { small, wide };
    });
    expect(layout).toEqual({ small: [], wide: false });
    // Raw notice text can contain punctuation and tag-like characters.
    expect(await page.locator('#archive-credit').textContent()).toBe(credit);
    await expect(page.locator('#archive-credit *')).toHaveCount(0);
    const scan = await new AxeBuilder({ page }).analyze();
    expect(scan.violations.map(v => ({ id: v.id, elements: v.nodes.map(n => n.target) }))).toEqual([]);
  });
}

test('skip link, file inputs and validation work from the keyboard', async ({ page, inspector }) => {
  await page.goto(inspector + '?lang=en');
  await expect(page.locator('#workspace')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Français' })).toBeFocused();
  const outline = await page.locator('#language').evaluate(el => {
    const style = getComputedStyle(el);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(outline.style).toBe('solid');
  expect(outline.width).toBeGreaterThanOrEqual(2);
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.locator('#language')).toHaveAccessibleName('English');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Archive de tuiles vectorielles', { exact: true })).toBeFocused();
  await page.locator('#archive-file').setInputFiles(await testFile());
  await expect(page.getByRole('heading', { name: 'Tuile 0/0/0' })).toBeVisible();
  await page.getByLabel('Colonne de la tuile (x)', { exact: true }).fill('9');
  await page.keyboard.press('Enter');
  await expect(page.locator('#x')).toBeFocused();
  await expect(page.locator('#x')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#x')).toHaveAttribute('aria-errormessage', 'lookup-error');
  await expect(page.locator('#lookup-error')).toContainText('Saisissez un entier');
  await expect(page.locator('#download')).toBeDisabled();
  await page.locator('#x').fill('0');
  await page.keyboard.press('Enter');
  await expect(page.locator('#position')).toBeFocused();
  await expect(page.locator('#lookup-error')).toBeEmpty();
  await expect(page.locator('#download')).toBeEnabled();
});

test('address and point lookups distinguish absent addresses from present empty layers', async ({ page, inspector }) => {
  await openSample(page, inspector, 'en');
  await page.locator('#zoom').fill('1');
  await page.locator('#x').fill('1');
  await page.locator('#y').fill('0');
  await expect(page.locator('#tile-status')).toContainText('Inspect the edited address');
  await expect(page.locator('#download')).toBeDisabled();
  await page.getByRole('button', { name: 'Inspect tile' }).click();
  await expect(page.locator('#position')).toHaveText('Tile 1/1/0');
  await expect(page.locator('#summary')).toHaveText('This address has no tile entry in the archive.');
  await expect(page.locator('#extent')).not.toContainText('Layers in the tile');
  expect((await downloadedReport(page)).text).toContain('The archive has no tile at this address.');

  await page.locator('#mode').selectOption('point');
  await page.getByLabel('Longitude', { exact: true }).fill('-100,5');
  await page.getByLabel('Latitude', { exact: true }).fill('30,5');
  await page.getByRole('button', { name: 'Inspect tile' }).click();
  await expect(page.locator('#position')).toHaveText('Tile 1/0/0');
  await expect(page.locator('#summary')).toHaveText('The tile is present and contains no encoded features.');
  await expect(page.locator('#extent')).toContainText('lines');
  await expect(page.locator('#groups li')).toHaveCount(0);
  const empty = await downloadedReport(page);
  expect(empty.text).toContain('No features encoded in this layer.');
  expect(empty.text).toContain('Encoded features: 0');
  await expect(page.locator('#north')).toBeDisabled();
  await expect(page.locator('#west')).toBeDisabled();
  await page.getByRole('button', { name: 'Move east' }).click();
  await expect(page.locator('#position')).toHaveText('Tile 1/1/0');
  await expect(page.locator('#position')).toBeFocused();
  await page.locator('#mode').selectOption('tile');
  await expect(page.locator('#x')).toHaveValue('1');
  await expect(page.locator('#y')).toHaveValue('0');
});

test('registry changes preserve unknowns, supplied values and the decoded tile', async ({ page, inspector }) => {
  await openSample(page, inspector, 'en');
  const sampleRow = page.locator('#groups li').filter({ has: page.getByRole('heading', { name: 'sample-a', exact: true }) });
  const missingId = page.locator('#groups li').filter({ has: page.getByRole('heading', { name: 'UNKNOWN', exact: true }) });
  await expect(sampleRow).toContainText('Open a source registry to look up this ID.');
  await expect(missingId).toContainText('These features have no usable source ID.');
  await expect(page.locator('#summary')).toHaveText('Encoded features: 18. Source groups: 17.');

  await registry(page, [sample]);
  await expect(sampleRow.getByText(sample.name, { exact: true })).toBeVisible();
  for (const value of [sample.licence_id, sample.retrieved_at, String(sample.tier), sample.attribution]) {
    await expect(sampleRow.locator('dd').getByText(value, { exact: true })).toBeVisible();
  }
  await expect(sampleRow.locator('em')).toHaveCount(0);
  await expect(missingId).toContainText('These features have no usable source ID.');
  const unlisted = page.locator('#groups li').filter({ has: page.getByRole('heading', { name: ids[0], exact: true }) });
  await expect(unlisted).toContainText('This source ID has no entry in the selected registry.');
  await expect(unlisted.getByText('UNKNOWN', { exact: true })).toHaveCount(5);

  await registry(page, [sample, sample], 'duplicate.json');
  await expect(page.locator('#registry-error')).toContainText('The registry repeats a source ID.');
  await expect(page.locator('#registry-error')).toContainText('Registry entry: 2.');
  await expect(page.locator('#registry-status')).toContainText('Still displaying sample.json.');
  await expect(sampleRow).toContainText(sample.name);
  await registry(page, [], 'empty.json');
  await expect(page.locator('#registry-error')).toBeEmpty();
  await expect(page.locator('#registry-status')).toContainText('Source entries: 0.');
  await expect(sampleRow).toContainText('This source ID has no entry in the selected registry.');
  await page.getByRole('button', { name: 'Clear registry' }).click();
  await expect(page.locator('#registry-file')).toBeFocused();
  await expect(sampleRow).toContainText('Open a source registry to look up this ID.');
  await expect(page.locator('#registry-status')).toContainText('No registry selected.');
});

test('French report includes every page of groups, literal credit and matched evidence', async ({ page, inspector }) => {
  await openSample(page, inspector, 'fr');
  await registry(page, [sample]);
  await expect(page.locator('#registry-status')).toContainText('sample.json');
  await expect(page.locator('#groups li')).toHaveCount(12);
  await expect(page.locator('#page-position')).toHaveText('Groupes 1 à 12 sur 17');
  await page.getByRole('button', { name: 'Groupes suivants' }).click();
  await expect(page.locator('#page-position')).toBeFocused();
  await expect(page.locator('#page-position')).toHaveText('Groupes 13 à 17 sur 17');
  await expect(page.locator('#groups li')).toHaveCount(5);
  await expect(page.locator('#next-page')).toBeDisabled();
  await expect(page.locator('#groups')).not.toContainText(sample.name);
  const report = await downloadedReport(page);
  expect(report.name).toBe('tile-sources-0-0-0-fr.txt');
  expect(report.text).toContain('Rapport sur les sources de la tuile');
  expect(report.text).toContain('Mention enregistrée dans l’archive\u00a0: ' + credit);
  for (const id of ['UNKNOWN', sample.id, ...ids]) {
    // One count in the layer, one entry in the source reference list.
    expect(report.text.split('Identifiant de source\u00a0: ' + id + '\n')).toHaveLength(3);
  }
  expect(report.text).toContain('Identifiant de source trouvé dans le registre fourni.');
  expect(report.text).toContain('Niveau de preuve\u00a0: 0');
  expect(report.text).toContain('Date de collecte\u00a0: ' + sample.retrieved_at);
  expect(report.text).toContain('Mention du registre\u00a0: ' + sample.attribution);
  await expect(page.locator('#export-status')).toContainText('Le rapport de la tuile est prêt');
  await page.getByRole('button', { name: 'Groupes précédents' }).click();
  await expect(page.locator('#previous-page')).toBeDisabled();
  await expect(page.locator('#groups')).toContainText(sample.name);

  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#position')).toHaveText('Tile 0/0/0');
  await expect(page.locator('#groups')).toContainText(sample.name);
  expect(await page.locator('#archive-credit').textContent()).toBe(credit);
});

test('bad archive replacements leave the current result usable until cleared', async ({ page, inspector }) => {
  await openSample(page, inspector, 'en');
  await page.locator('#archive-file').setInputFiles({
    name: 'clipped.pmtiles', mimeType: 'application/octet-stream', buffer: Buffer.from([1, 2, 3]),
  });
  await expect(page.locator('#archive-error')).toContainText('Could not open clipped.pmtiles.');
  await expect(page.locator('#archive-status')).toContainText('Still displaying sample.pmtiles.');
  await expect(page.locator('#position')).toHaveText('Tile 0/0/0');
  await expect(page.locator('#download')).toBeEnabled();
  await page.locator('#archive-file').setInputFiles(await testFile('replacement.pmtiles', 'Second selection'));
  await expect(page.locator('#archive-status')).toHaveText('Open file: replacement.pmtiles');
  await expect(page.locator('#archive-info')).toContainText('Second selection');
  await expect(page.locator('#archive-error')).toBeEmpty();
  await page.getByRole('button', { name: 'Clear archive' }).click();
  await expect(page.locator('#archive-file')).toBeFocused();
  await expect(page.locator('#opened')).toBeHidden();
  await expect(page.locator('#archive-status')).toHaveText('Choose an archive to begin.');
  await expect(page.locator('#archive-clear')).toBeDisabled();
});

type DelayedRead = Window & { releaseHeader?: () => void; headerReleased?: boolean };
test('a slower file selection cannot replace a newer archive', async ({ page, inspector }) => {
  await page.goto(inspector + '?lang=en');
  await expect(page.locator('#workspace')).toBeVisible();
  // Gate only the first header. The second selection takes the native path.
  await page.evaluate(() => {
    const original = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = async function () {
      if (this.size !== 127) return original.call(this);
      Blob.prototype.arrayBuffer = original;
      const control = window as DelayedRead;
      await new Promise<void>(resolve => { control.releaseHeader = resolve; });
      try {
        return await original.call(this);
      } finally {
        control.headerReleased = true;
      }
    };
  });
  await page.locator('#archive-file').setInputFiles(await testFile('older.pmtiles', 'Earlier selection'));
  await page.waitForFunction(() => typeof (window as DelayedRead).releaseHeader === 'function');
  await expect(page.locator('#archive-status')).toContainText('Opening older.pmtiles…');
  await page.locator('#archive-file').setInputFiles(await testFile('newer.pmtiles', 'Later selection'));
  await expect(page.locator('#archive-info')).toContainText('Later selection');
  await expect(page.locator('#position')).toHaveText('Tile 0/0/0');
  await page.evaluate(() => (window as DelayedRead).releaseHeader?.());
  await page.waitForFunction(() => (window as DelayedRead).headerReleased);
  await expect(page.locator('#archive-status')).toHaveText('Open file: newer.pmtiles');
  await expect(page.locator('#archive-info')).not.toContainText('Earlier selection');
  await expect(page.locator('#archive-error')).toBeEmpty();
});

test('French fallback and keyboard access are available with scripts disabled', async ({ browser, inspector }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, locale: 'en-CA' });
  try {
    const page = await context.newPage();
    await page.goto(inspector);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.getByRole('heading', { name: 'Sources d’une tuile' })).toBeVisible();
    await expect(page.getByText('Activez les scripts du navigateur', { exact: false })).toBeVisible();
    await expect(page.locator('#fallback [lang="en"]')).toBeVisible();
    await expect(page.locator('#workspace')).toBeHidden();
    await expect(page.locator('#language')).toBeHidden();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Aller au contenu principal' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main')).toBeFocused();
  } finally {
    await context.close();
  }
});
