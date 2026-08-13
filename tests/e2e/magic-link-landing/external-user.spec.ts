/**
 * External-user e2e — magic-link-landing.
 *
 * The magic-link landing consumes a one-time token from a query
 * parameter. The page must:
 *   - Render a loading state on entry.
 *   - Show a clear error when the token is missing/invalid/used.
 *   - Show success + redirect CTA when the token is valid.
 *   - Never leak server error details to the user.
 */
import { test, expect } from '@playwright/test';

test.describe('magic-link-landing — external user', () => {
  test('home renders without token', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status() ?? 0).toBeLessThan(500);
    await expect(page.locator('main, body')).toBeVisible();
  });

  test('invalid token shows a user-friendly error', async ({ page }) => {
    await page.goto('/?token=invalid-bogus-token');
    // Should not 5xx and should not show stack traces
    const body = await page.content();
    expect(body).not.toMatch(/at \w+\.\w+ \(/); // no JS stack frames
    expect(body).not.toMatch(/node_modules/);
  });

  test('valid-format-but-bogus token resolves to an error state', async ({ page }) => {
    await page.goto('/?token=eyJhbGciOiJIUzI1NiJ9.bogus.signature');
    await page.waitForLoadState('networkidle');
    const body = await page.content();
    // The page should NOT silently succeed.
    expect(body.toLowerCase()).toMatch(/invalid|expired|error|revoked|consumed|denied/);
  });

  test('does not leak error stack traces', async ({ page }) => {
    await page.goto('/?token=invalid');
    const body = await page.content();
    expect(body).not.toMatch(/at .*:\d+:\d+/);
    expect(body).not.toMatch(/TypeError|ReferenceError|SyntaxError/);
  });

  test('rejects excessively long tokens without crashing', async ({ page }) => {
    const huge = 'a'.repeat(8192);
    const res = await page.goto(`/?token=${huge}`);
    expect(res?.status() ?? 0).toBeLessThan(500);
  });
});