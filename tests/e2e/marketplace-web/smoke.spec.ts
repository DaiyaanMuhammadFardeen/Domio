/**
 * Marketplace-web smoke spec.
 */
import { test, expect } from '@playwright/test';

test('marketplace-web home renders hero', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel(/domio marketplace/i)).toBeVisible();
});