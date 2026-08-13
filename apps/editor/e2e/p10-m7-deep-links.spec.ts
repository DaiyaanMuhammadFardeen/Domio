import { test, expect } from '@playwright/test';

/**
 * P10 M7 — Deep-Link State Codec e2e.
 *
 * Covers:
 *   - Share current state from the editor toolbar.
 *   - Open the deep-links panel; mint a sample link; resolve it.
 *   - Token is copied to the clipboard (or surfaced via the
 *     "copied" hint when the clipboard API is unavailable).
 *
 * The "expired" and "partial" toast paths live in the viewer; the
 * unit tests in @domio/prototype-runtime cover their prop shape.
 */
test.describe('P10 M7 — Deep links', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/editor/demo');
    await page.waitForSelector('[data-testid="m7-deep-links-tab"]', { timeout: 10000 });
  });

  test('Share current state button mounts and copies a URL', async ({ page }) => {
    // Grant clipboard so navigator.clipboard.writeText resolves.
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.click('[data-testid="m7-share-button"]');
    await expect(page.locator('[data-testid="m7-share-copied"]')).toBeVisible();

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toMatch(/\/d\?token=[A-Za-z0-9_-]+$/);
  });

  test('Deep Links tab opens the panel and lists rows', async ({ page }) => {
    await page.click('[data-testid="m7-deep-links-tab"]');
    await expect(page.locator('[data-testid="m7-deep-links-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="m7-deep-link-list"]')).toBeVisible();

    // Empty state initially
    await expect(page.getByText('No deep links minted yet.')).toBeVisible();
  });

  test('Test resolve button mints a sample link and renders a row', async ({ page }) => {
    await page.click('[data-testid="m7-deep-links-tab"]');
    await page.click('[data-testid="m7-deep-link-create"]');
    await expect(page.locator('[data-testid="m7-deep-link-row"]')).toBeVisible();
    await expect(page.locator('[data-testid="m7-deep-link-scope"]')).toHaveText('public');
    await expect(page.locator('[data-testid="m7-deep-link-clicks"]')).toHaveText('0 clicks');
  });

  test('Resolve renders the resolved payload summary', async ({ page }) => {
    await page.click('[data-testid="m7-deep-links-tab"]');
    await page.click('[data-testid="m7-deep-link-create"]');
    await page.click('[data-testid="m7-deep-link-resolve"]');
    await expect(page.locator('[data-testid="m7-deep-link-resolved"]')).toBeVisible();
    await expect(page.locator('[data-testid="m7-deep-link-resolved"]')).toContainText('scenario');
  });

  test('Copy URL passes the short id to the clipboard', async ({ page }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.click('[data-testid="m7-deep-links-tab"]');
    await page.click('[data-testid="m7-deep-link-create"]');
    await page.click('[data-testid="m7-deep-link-copy"]');

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toMatch(/^\/d\/[A-Z0-9]{9}$/);
  });
});
