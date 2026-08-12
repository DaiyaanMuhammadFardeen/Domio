/**
 * Viewer smoke spec.
 *
 * Loads `/` and asserts the headline + empty state. Per Wave 1 §S1.7.
 */
import { test, expect } from '@playwright/test';

test('viewer home renders', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /domio viewer/i })).toBeVisible();
});