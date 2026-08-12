/**
 * Landing smoke spec.
 */
import { test, expect } from '@playwright/test';

test('landing home renders hero copy', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Domio' })).toBeVisible();
});