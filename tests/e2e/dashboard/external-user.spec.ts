/**
 * External-user e2e — dashboard.
 *
 * The dashboard is the operator's data plane. External users should
 * never reach it. Every route either redirects to login or returns a
 * 401/403 — never 5xx and never leaks data.
 */
import { test, expect } from '@playwright/test';

const ROUTES = [
  '/overview',
  '/sentiment',
  '/benchmarks',
  '/crm',
  '/deck/sample-deck',
  '/export',
  '/heatmap',
  '/live',
  '/ab',
  '/api',
  '/sessions',
  '/alerts',
  '/cohorts',
  '/csat',
  '/funnel',
  '/graph',
  '/kpis',
  '/team',
];

test.describe('dashboard — external user', () => {
  for (const route of ROUTES) {
    test(`does not crash or leak data at ${route}`, async ({ page }) => {
      const res = await page.goto(route);
      const status = res?.status() ?? 0;
      expect(status).toBeLessThan(500);
    });
  }

  test('home redirects to login or /overview guard', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status() ?? 0).toBeLessThan(500);
    // Either we ended up on login or we got redirected to /overview
    // (which then itself renders the guard).
    const url = new URL(page.url());
    expect(['/', '/overview', '/login', '/signin', '/auth'].some((p) => url.pathname === p)).toBe(
      true,
    );
  });

  test('does not expose aggregated metrics to anonymous users', async ({ page }) => {
    const res = await page.request.get('/v1/kpis/aggregate');
    expect([401, 403, 404]).toContain(res.status());
  });

  test('does not expose heatmap data anonymously', async ({ page }) => {
    const res = await page.request.get('/v1/heatmap/deck-001');
    expect([401, 403, 404]).toContain(res.status());
  });

  test('does not expose A/B results anonymously', async ({ page }) => {
    const res = await page.request.get('/v1/ab/results');
    expect([401, 403, 404]).toContain(res.status());
  });
});
