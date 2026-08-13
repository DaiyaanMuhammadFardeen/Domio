import { test, expect } from '@playwright/test';

test.describe('P10/M8 NL Patch', () => {
  test('renders the NL Patch tab', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-testid="m8-nl-patch-tab"]');
    await expect(page.locator('[data-testid="m8-nl-prompt"]')).toBeVisible();
  });

  test('parses a prompt and shows the diff', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-testid="m8-nl-patch-tab"]');
    await page.fill('[data-testid="m8-nl-prompt"]', 'add hotspot foo');
    await page.click('[data-testid="m8-nl-patch"]');
    await expect(page.locator('[data-testid="m8-nl-call"]')).toBeVisible();
  });

  test('shows the audit trail alongside the patch', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-testid="m8-audit-tab"]');
    await expect(
      page.locator('[data-testid="m8-audit-root"], [data-testid="m8-audit-empty"]'),
    ).toBeVisible();
  });
});
