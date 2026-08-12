/**
 * Admin console smoke spec.
 */
import { test, expect } from '@playwright/test';

test('admin-console home renders', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/admin/i).first()).toBeVisible();
});