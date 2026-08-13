/**
 * Phase 17 — e2e /dashboard/navigate.
 *
 * Boots the dashboard, navigates every primary route, and snapshots
 * each one so the screenshots can be diffed in CI for visual
 * regressions.  The 7 routes are the canonical ones shipped by
 * apps/dashboard (see W11).
 */
import { test, expect } from '@playwright/test';

const ROUTES = [
  { name: 'overview', path: '/overview' },
  { name: 'deck', path: '/deck/deck-fixture-1' },
  { name: 'heatmap', path: '/heatmap' },
  { name: 'ab', path: '/ab' },
  { name: 'crm', path: '/crm' },
  { name: 'team', path: '/team' },
  { name: 'live', path: '/live' },
  { name: 'benchmarks', path: '/benchmarks' },
];

test.describe('dashboard — navigate', () => {
  for (const route of ROUTES) {
    test(`renders ${route.name} (${route.path})`, async ({ page }) => {
      await page.goto(route.path);

      // Wait for the route's main element to mount before snapshotting
      // so the screenshot only captures the post-hydration tree.
      await page.waitForSelector('main[role="main"], main, [data-testid="dashboard-root"]', {
        timeout: 15_000,
      });

      // Take a per-route screenshot. CI artifact upload is configured
      // in the reusable Playwright workflow.
      await page.screenshot({
        path: `test-results/dashboard-${route.name}.png`,
        fullPage: true,
      });

      // Sanity check: page title is set (every dashboard route sets
      // a distinct title via the per-page metadata).
      const title = await page.title();
      expect(title.length).toBeGreaterThan(0);
    });
  }
});
