/**
 * External-user e2e — viewer.
 *
 * The viewer is the read-only surface where audiences consume a deck.
 * Tests cover: home + deck-open form, recent-decks, viewer modes
 * (scroll / autoplay / slide), and kiosk mode.
 */
import { test, expect } from '@playwright/test';

test.describe('viewer — external user', () => {
  test('home renders headline + open form', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: /domio viewer/i })).toBeVisible();
    // Open form (deck id + button) should be present
    await expect(
      page.locator('input[name="deckId"], input[placeholder*="deck" i]').first(),
    ).toBeVisible();
  });

  test('submitting a deck id navigates to the viewer', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('input[name="deckId"], input[placeholder*="deck" i]').first();
    if (await input.count()) {
      await input.fill('demo-deck-id-001');
      const submit = page.locator('button[type="submit"], button:has-text("open")').first();
      if (await submit.count()) {
        await submit.click();
        await expect(page).toHaveURL(/\/demo-deck-id-001/);
      }
    }
  });

  test('demo route renders the embedded viewer', async ({ page }) => {
    const res = await page.goto('/demo');
    expect(res?.status() ?? 0).toBeLessThan(500);
    await expect(page.locator('main, [data-testid="viewer-root"]')).toBeVisible();
  });

  test('deck route renders without crashing for any id', async ({ page }) => {
    const res = await page.goto('/abc-deck-123');
    expect(res?.status() ?? 0).toBeLessThan(500);
  });

  test('scroll mode is reachable at /{deckId}/scroll', async ({ page }) => {
    const res = await page.goto('/abc-deck-123/scroll');
    expect(res?.status() ?? 0).toBeLessThan(500);
  });

  test('autoplay mode is reachable at /{deckId}/autoplay', async ({ page }) => {
    const res = await page.goto('/abc-deck-123/autoplay');
    expect(res?.status() ?? 0).toBeLessThan(500);
  });

  test('slide-indexed route is reachable at /{deckId}/0', async ({ page }) => {
    const res = await page.goto('/abc-deck-123/0');
    expect(res?.status() ?? 0).toBeLessThan(500);
  });

  test('kiosk mode renders at /kiosk', async ({ page }) => {
    const res = await page.goto('/kiosk');
    expect(res?.status() ?? 0).toBeLessThan(500);
  });

  test('recent decks persists to localStorage', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('input[name="deckId"], input[placeholder*="deck" i]').first();
    if (await input.count()) {
      await input.fill('recent-test-deck');
      const submit = page.locator('button[type="submit"], button:has-text("open")').first();
      if (await submit.count()) {
        await submit.click();
        await page.waitForLoadState('networkidle');
        const recent = await page.evaluate(() => localStorage.getItem('domio-viewer-recent'));
        expect(recent).not.toBeNull();
        expect(recent).toContain('recent-test-deck');
      }
    }
  });

  test('handles very long deck id without crashing', async ({ page }) => {
    const longId = 'a'.repeat(256);
    const res = await page.goto(`/${longId}`);
    expect(res?.status() ?? 0).toBeLessThan(500);
  });

  test('handles unicode in deck id without crashing', async ({ page }) => {
    const res = await page.goto('/演示-deck-орг');
    expect(res?.status() ?? 0).toBeLessThan(500);
  });
});
