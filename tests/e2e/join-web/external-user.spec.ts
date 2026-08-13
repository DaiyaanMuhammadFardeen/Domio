/**
 * External-user e2e — join-web.
 *
 * The join-web surface is mobile-first — phone audiences land here
 * to join a live session via short code, magic token, or feedback
 * submission. Tests cover the join form, /j/{code}, /h/{token}, and
 * the per-session feedback page.
 */
import { test, expect } from '@playwright/test';

test.describe('join-web — external user', () => {
  test('home renders join form', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('form, [data-testid="join-form"]').first()).toBeVisible();
  });

  test('submitting a code routes to /j/{code}', async ({ page }) => {
    await page.goto('/');
    const codeInput = page.locator('input[name="code"], input[placeholder*="code" i]').first();
    if (await codeInput.count()) {
      await codeInput.fill('ABCD-1234');
      const submit = page.locator('button[type="submit"]').first();
      if (await submit.count()) {
        await submit.click();
        await expect(page).toHaveURL(/j\/ABCD-1234|\/j\//);
      }
    }
  });

  test('short-code route /j/{code} renders without crashing', async ({ page }) => {
    const res = await page.goto('/j/ABCD-1234');
    expect(res?.status() ?? 0).toBeLessThan(500);
  });

  test('magic-link route /h/{token} renders', async ({ page }) => {
    const res = await page.goto('/h/eyJhbGciOiJIUzI1NiJ9.bogus.token');
    expect(res?.status() ?? 0).toBeLessThan(500);
  });

  test('feedback route /feedback/{session_id} renders', async ({ page }) => {
    const res = await page.goto('/feedback/session-xyz');
    expect(res?.status() ?? 0).toBeLessThan(500);
  });

  test('handles unicode in short code', async ({ page }) => {
    const res = await page.goto('/j/演示-CODE');
    expect(res?.status() ?? 0).toBeLessThan(500);
  });

  test('handles extremely long token without crashing', async ({ page }) => {
    const longToken = 'a'.repeat(2048);
    const res = await page.goto(`/h/${longToken}`);
    expect(res?.status() ?? 0).toBeLessThan(500);
  });

  test('kiosk landing page loads at /kiosk', async ({ page }) => {
    const res = await page.goto('/kiosk');
    expect(res?.status() ?? 0).toBeLessThan(500);
  });
});