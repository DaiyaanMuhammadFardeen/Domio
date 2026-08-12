/**
 * Creator console smoke spec.
 */
import { test, expect } from '@playwright/test';

test('creator-console home renders nav', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/listings/i).first()).toBeVisible();
});