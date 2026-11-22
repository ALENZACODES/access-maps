import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { base } from '../../tools/data-qa/offline-reconcile/fixtures.mjs';
import { listenOnLoopback } from '../../tools/data-qa/offline-reconcile/serve.mjs';

const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];

test.describe('Local evidence reconciliation', () => {
  let local;
  test.beforeAll(async () => { local = await listenOnLoopback(); });
  test.afterAll(async () => {
    if (local) await new Promise((resolve) => local.server.close(resolve));
  });

  const views = [320, 390, 1280].flatMap(width => ['en', 'fr'].map(locale => ({ width, locale })));
  for (const { width, locale } of views) {
    test(`audits and exports a local package offline with keyboard controls (${locale}, ${width}px)`, async ({ page, context }) => {
      const french = locale === 'fr';
      const blocked = [];
      await context.route('**/*', async (route) => {
        if (new URL(route.request().url()).origin === new URL(local.url).origin) return route.continue();
        blocked.push(route.request().url());
        return route.abort();
      });
      await page.setViewportSize({ width, height: 820 });
      await page.goto(local.url);
      const language = page.locator('#language-select');
      await language.selectOption(locale);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('#previous-file')).toBeHidden();
      await expect(page.locator('#policy-file')).toBeHidden();
      const save = page.getByRole('button', { name: french ? 'Enregistrer le rapport JSON' : 'Save JSON report' });
      await expect(save).toBeDisabled();
      await language.focus();
      await page.keyboard.press('Tab');
      const current = page.getByLabel(french ? 'Paquet actuel' : 'Current package', { exact: true });
      await expect(current).toBeFocused();
      expect(await current.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe('solid');
      await context.setOffline(true);
      const pkg = base();
      await current.setInputFiles({
        name: 'fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pkg)),
      });
      const audit = page.getByRole('button', { name: french ? 'Contrôler la publication' : 'Check publication' });
      await expect(audit).toBeEnabled();
      await page.keyboard.press('Tab');
      await expect(audit).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('status')).toHaveText(french ? 'Contrôles réussis' : 'Checks passed');
      const download = page.waitForEvent('download');
      await save.click();
      const file = await download;
      const report = JSON.parse(await readFile(await file.path(), 'utf8'));
      expect(report.ok).toBe(true);
      expect(report.totals.decisions).toBe(1);
      expect(JSON.stringify(report)).not.toContain(pkg.observations[0].noteEn);
      const compare = page.getByRole('button', { name: french ? 'Comparer les publications' : 'Compare releases' });
      await compare.click();
      await expect(page.locator('#previous-file')).toBeVisible();
      await expect(page.getByRole('alert')).toHaveText(french ? 'Choisissez un fichier JSON local.' : 'Choose a local JSON file.');
      await expect(save).toBeDisabled();
      const failures = await page.locator('input:visible, select:visible, button:visible').evaluateAll((controls) =>
        controls.filter((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width < 44 || rect.height < 44;
        }).map((node) => node.id));
      expect(failures).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await context.setOffline(false);
      const scan = await new AxeBuilder({ page }).withTags(tags).analyze();
      expect(scan.violations).toEqual([]);
      expect(blocked).toEqual([]);
    });
  }
});
