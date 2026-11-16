import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Integration test: the host Vite preview must mount ConditionsList at
 * /conditions-test with the synthetic records and drafts. This package
 * deliberately does not change the app shell.
 */
for (const width of [320, 1280]) {
  for (const language of ["en", "fr"] as const) {
    test(`conditions list axe at ${width}px (${language})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`/conditions-test?lang=${language}`);
      await expect(
        page.locator("#conditions-heading"),
      ).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }
}
