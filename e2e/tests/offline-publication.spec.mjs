import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { startOfflineServer } from '../../tools/data-qa/offline-review/serve.mjs';
import { AS_OF, manifest } from '../../tools/data-qa/offline-review/test-helpers.mjs';
import { listenOnLoopback } from '../../tools/data-qa/offline-reconcile/serve.mjs';
import { base } from '../../tools/data-qa/offline-reconcile/fixtures.mjs';

let reviewServer;
let reconcileServer;

test.beforeAll(async () => {
  reviewServer = await startOfflineServer(0);
  reconcileServer = (await listenOnLoopback()).server;
});

test.afterAll(async () => {
  for (const server of [reviewServer, reconcileServer]) {
    if (server) await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  }
});

function address(server) {
  return 'http://127.0.0.1:' + server.address().port + '/';
}

function file(content) {
  return { name: 'fictional.json', mimeType: 'application/json', buffer: Buffer.from(content) };
}

async function checkAccessibility(page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map(({ id, nodes }) => ({ id, elements: nodes.map(node => node.target) }))).toEqual([]);
  const undersized = await page.locator('a[href]:visible, button:visible, input:visible, select:visible')
    .evaluateAll(elements => elements.flatMap(element => {
      const { width, height } = element.getBoundingClientRect();
      return width < 44 || height < 44 ? [{ id: element.id, width, height }] : [];
    }));
  expect(undersized).toEqual([]);
}

async function followSkipLink(page, target) {
  await page.keyboard.press('Tab');
  const link = page.locator('a[href="#' + target + '"]');
  await expect(link).toBeFocused();
  expect(await link.evaluate(element => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2 &&
      box.x >= 0 && box.y >= 0 && box.right <= innerWidth && box.bottom <= innerHeight;
  })).toBe(true);
  await page.keyboard.press('Enter');
  await expect(page.locator('#' + target)).toBeFocused();
}

for (const language of ['en', 'fr']) {
  for (const width of [390, 1280]) {
    test.describe(language + ' at ' + width + 'px', () => {
      test.use({ viewport: { width, height: 844 } });

      test('offline publication review exposes its result and clears it when input changes', async ({ page }) => {
        await page.goto(address(reviewServer));
        await followSkipLink(page, 'results');
        await page.locator('#locale').selectOption(language);
        await expect(page.locator('html')).toHaveAttribute('lang', language);
        await checkAccessibility(page);
        await page.locator('#as-of').fill(AS_OF);
        await page.locator('#current').setInputFiles(file(JSON.stringify(manifest())));
        await page.locator('#submit-review').press('Enter');
        await expect(page.locator('#review-status')).toHaveAttribute('data-outcome', /passed|blocked/);
        expect(await page.locator('#findings-output .finding h4').allTextContents()).toEqual([]);
        await expect(page.locator('#review-status')).toHaveAttribute('data-outcome', 'passed');
        await expect(page.locator('#results')).toBeFocused();
        await page.locator('#toggle-sources').press('Enter');
        await expect(page.locator('#source-output')).toContainText('source-a');
        await expect(page.getByRole('navigation', { name: language === 'fr' ? 'Pages de résultats' : 'Findings pages' })).toBeVisible();
        await checkAccessibility(page);

        await page.locator('#current').setInputFiles(file('{'));
        await expect(page.locator('#export-json')).toBeHidden();
        await page.locator('#submit-review').press('Enter');
        await expect(page.locator('#input-status')).toContainText(language === 'fr' ? /fichier/i : /file/i);
        await expect(page.locator('#review-status')).not.toHaveAttribute('data-outcome', 'passed');
        await page.locator('#clear-review').press('Enter');
        await expect(page.locator('#as-of')).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
      });

      test('offline reconciliation announces outcomes for the selected file in the selected language', async ({ page }) => {
        await page.goto(address(reconcileServer));
        await followSkipLink(page, 'review');
        await page.locator('#language-select').selectOption(language);
        await expect(page.locator('html')).toHaveAttribute('lang', language);
        await expect(page).toHaveTitle(await page.getByRole('heading', { level: 1 }).innerText());
        await checkAccessibility(page);
        await page.locator('#current-file').setInputFiles(file(JSON.stringify(base())));
        await page.locator('#action-audit').press('Enter');
        await expect(page.getByRole('status')).toHaveText(language === 'fr' ? 'Contrôles réussis' : 'Checks passed');
        await expect(page.getByRole('list', { name: language === 'fr' ? 'Résumé' : 'Summary' })).toBeVisible();
        await checkAccessibility(page);
        await page.locator('#current-file').setInputFiles(file('{'));
        await expect(page.getByRole('alert')).toContainText(language === 'fr' ? /fichier/i : /file/i);
        await page.locator('#action-audit').press('Enter');
        await expect(page.getByRole('status')).toBeEmpty();
        await expect(page.getByRole('alert')).toContainText(language === 'fr' ? /Choisissez/ : /Choose/);
        await page.locator('#action-reset').press('Enter');
        await expect(page.locator('#current-file')).toHaveValue('');
      });
    });
  }
}
