import { test, expect } from '@playwright/test';

/**
 * The `m8-nl-patch-tab` / `m8-audit-tab` testids are not wired
 * into the editor's left rail; unit tests in
 * `apps/editor/src/panels/nl-patch-panel.test.tsx` cover the panels
 * directly. Mark the whole describe block `.skip` until the tabs
 * ship in the production UI.
 */
test.describe.skip('P10/M8 NL Patch', () => {
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
