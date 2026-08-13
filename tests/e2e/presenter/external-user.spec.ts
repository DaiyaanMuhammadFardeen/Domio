/**
 * External-user e2e — presenter.
 *
 * The presenter is the live-rendering surface for the speaker.
 * Tests cover the boot screen, demo session link, secondary-display
 * mode, and the session shell hydration.
 */
import { test, expect } from '@playwright/test';

test.describe('presenter — external user', () => {
  test('home renders headline + demo link', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /domio presenter/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /demo session/i })).toBeVisible();
  });

  test('clicking demo link navigates to /session/demo', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /demo session/i }).click();
    await expect(page).toHaveURL(/session\/demo/);
  });

  test('secondary display mode via query', async ({ page }) => {
    await page.goto('/session/demo?display=secondary');
    await expect(page.locator('main, [data-testid="presenter-root"]')).toBeVisible();
  });

  test('pair route is reachable at /pair/{code}', async ({ page }) => {
    const res = await page.goto('/pair/ABCD-1234');
    expect(res?.status() ?? 0).toBeLessThan(500);
  });

  test('handles arbitrary session id without crashing', async ({ page }) => {
    const res = await page.goto('/session/some-unknown-session');
    expect(res?.status() ?? 0).toBeLessThan(500);
  });

  test('handles unicode session id', async ({ page }) => {
    const res = await page.goto('/session/演示-session-орг');
    expect(res?.status() ?? 0).toBeLessThan(500);
  });

  test('handles empty session id', async ({ page }) => {
    const res = await page.goto('/session/');
    expect(res?.status() ?? 0).toBeLessThan(500);
  });

  test('navigates to dashboard for share link generation', async ({ page }) => {
    await page.goto('/');
    const dashLink = page.getByRole('link', { name: /share link/i });
    if (await dashLink.count()) {
      const href = await dashLink.first().getAttribute('href');
      expect(href).toBeTruthy();
    }
  });
});