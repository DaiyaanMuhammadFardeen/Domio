import { test, expect } from '@playwright/test';

/**
 * P10-M6.2 — Presentation sequences e2e
 *
 * Smoke tests for the editor sequence-inspector panel. Confirms
 * the tab mounts, the panel renders, and the per-slide reordering
 * buttons drive the underlying state.
 */
test.describe('P10-M6.2 — Presentation sequences', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/editor/demo');
    await page.waitForSelector('[data-testid="m6-sequence-tab"]', { timeout: 10000 });
  });

  test('Sequence tab is visible and opens the inspector', async ({ page }) => {
    await page.click('[data-testid="m6-sequence-tab"]');
    await expect(page.locator('[data-testid="m6-sequence-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="m6-sequence-name"]')).toBeVisible();
    await expect(page.locator('[data-testid="m6-sequence-interval"]')).toBeVisible();
    await expect(page.locator('[data-testid="m6-sequence-policy"]')).toBeVisible();
  });

  test('Slide list renders one row per slide', async ({ page }) => {
    await page.click('[data-testid="m6-sequence-tab"]');
    await expect(page.locator('[data-testid="m6-sequence-slide-0"]')).toBeVisible();
    await expect(page.locator('[data-testid="m6-sequence-slide-1"]')).toBeVisible();
    await expect(page.locator('[data-testid="m6-sequence-slide-2"]')).toBeVisible();
  });

  test('Interruption policy can be changed via the dropdown', async ({ page }) => {
    await page.click('[data-testid="m6-sequence-tab"]');
    await page.locator('[data-testid="m6-sequence-policy"]').selectOption('abort');
    await expect(page.locator('[data-testid="m6-sequence-policy"]')).toHaveValue('abort');
  });

  test('Move-down reorders slides', async ({ page }) => {
    await page.click('[data-testid="m6-sequence-tab"]');
    const firstId = await page
      .locator('[data-testid="m6-sequence-slide-0"] .sequence-row__id')
      .innerText();
    await page.click('[data-testid="m6-sequence-down-0"]');
    const newFirstId = await page
      .locator('[data-testid="m6-sequence-slide-0"] .sequence-row__id')
      .innerText();
    expect(newFirstId).not.toBe(firstId);
  });
});
