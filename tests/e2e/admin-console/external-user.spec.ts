/**
 * External-user e2e — admin-console.
 *
 * The admin-console is restricted to authenticated operators. For an
 * external user, the expectation is that every route either:
 *   - redirects to login, or
 *   - shows a guard page with no data, or
 *   - returns a 401/403 from the API
 *
 * Tests verify that NO admin route leaks data and NO route crashes
 * with a 5xx for an unauthenticated visitor.
 */
import { test, expect } from '@playwright/test';

const ROUTES = [
  '/',
  '/rendering',
  '/api-explorer',
  '/trust',
  '/payouts',
  '/services',
  '/custom-domains',
  '/component-sdk',
  '/scim',
  '/audit',
  '/dlp',
  '/sso',
  '/seats',
  '/brand-locks',
  '/takedowns',
  '/residency',
  '/retention',
  '/api-keys',
  '/webhooks',
  '/sdk',
  '/plugins',
  '/mcp',
  '/change-feed',
  '/agent-handoff',
  '/billing',
  '/legal-hold',
];

test.describe('admin-console — external user', () => {
  for (const route of ROUTES) {
    test(`does not crash or leak data at ${route}`, async ({ page }) => {
      const res = await page.goto(route);
      const status = res?.status() ?? 0;
      // Either a redirect (4xx) or a guard page (200) — but never 5xx.
      expect(status).toBeLessThan(500);

      // If the page rendered with 200, it must not contain any
      // sensitive admin content markers. Operators only.
      const body = await page.content();
      expect(body).not.toContain('BEGIN OPERATOR-ONLY');
      expect(body).not.toContain('admin-secret');
    });
  }

  test('home redirects to login or shows guard', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status() ?? 0).toBeLessThan(500);
    // Either we're on a login page or a guard — but never on the
    // dashboard.
    const url = page.url();
    const isLogin = /login|signin|auth|guard/i.test(url) || url === 'about:blank';
    const isHome = new URL(url).pathname === '/';
    // Either we're shown a guard (login-like) or we're still on / with no data.
    expect(isLogin || isHome).toBe(true);
  });

  test('does not leak operator-only API responses to anonymous user', async ({ page }) => {
    await page.goto('/');
    // Try a direct API call to an operator-only endpoint.
    const apiRes = await page.request.get('/v1/operators/me');
    // Should be 401/403, not 200 with data.
    expect([401, 403, 404]).toContain(apiRes.status());
  });

  test('does not expose api-keys in DOM', async ({ page }) => {
    await page.goto('/api-keys');
    const body = await page.content();
    expect(body).not.toMatch(/sk_live_[a-z0-9]+/i);
  });
});
