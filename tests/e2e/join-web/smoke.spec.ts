/**
 * Join-web smoke spec.
 */
import { test, expect } from '@playwright/test';

test('join-web home renders', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /join/i }).first()).toBeVisible();
});
