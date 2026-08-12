/**
 * Presenter smoke spec.
 */
import { test, expect } from '@playwright/test';

test('presenter home renders the demo link', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /domio presenter/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /demo session/i })).toBeVisible();
});