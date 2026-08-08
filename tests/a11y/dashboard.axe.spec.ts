/**
 * Phase 17 — dashboard axe-core suite.
 *
 * Loads each of the 7 dashboard routes with axe-core injected via
 * @axe-core/playwright and asserts **zero serious or critical
 * accessibility violations** per route.  The 7 routes are the ones
 * shipped by apps/dashboard (see W11):
 *   /overview      — KPI tiles + sparklines
 *   /deck/[id]     — per-deck drill-down
 *   /heatmap       — per-deck attention heatmap
 *   /ab            — A/B decision table
 *   /crm           — CRM sync health
 *   /team          — workspace template/component rankings
 *   /live          — real-time KPI tiles (1 s refresh)
 *   /benchmarks    — cohort percentiles
 *
 * The test only runs against chromium to keep CI cheap; the same
 * selectors + tag config can be re-used with firefox/webkit by adding
 * projects to playwright.config.ts.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const DASHBOARD_ROUTES = [
  { name: 'overview', path: '/overview' },
  { name: 'deck',     path: '/deck/deck-fixture-1' },
  { name: 'heatmap',  path: '/heatmap' },
  { name: 'ab',       path: '/ab' },
  { name: 'crm',      path: '/crm' },
  { name: 'team',     path: '/team' },
  { name: 'live',     path: '/live' },
  { name: 'benchmarks', path: '/benchmarks' },
];

// Tags we evaluate. WCAG 2.1 AA + best-practice (no experimental).
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

test.describe('Dashboard — axe-core a11y', () => {
  for (const route of DASHBOARD_ROUTES) {
    test(`${route.name} (${route.path}) has 0 serious/critical violations`, async ({ page }) => {
      await page.goto(route.path);

      // Wait for the route's main landmark to mount before scanning —
      // otherwise axe races against Next.js hydration and reports
      // false positives on the loading skeleton.
      await page.waitForSelector('main[role="main"], main, [data-testid="dashboard-root"]', {
        timeout: 10_000,
      });

      const results = await new AxeBuilder({ page })
        .withTags(AXE_TAGS)
        .disableRules([
          // Color-contrast on charts is checked in a separate dashboard
          // visual diff job; the heatmap tiles render to canvas and are
          // out of scope for DOM-based contrast checks.
          'color-contrast',
        ])
        .analyze();

      const blocking = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );

      if (blocking.length > 0) {
        // Pretty-print so the failure log shows exactly which rules
        // fired on which elements.
        const summary = blocking
          .map(
            (v) =>
              `[${v.impact}] ${v.id} — ${v.help} (${v.nodes.length} node(s))\n` +
              v.nodes
                .slice(0, 3)
                .map((n) => `   • ${n.target.join(' ')}`)
                .join('\n'),
          )
          .join('\n');
        throw new Error(
          `axe-core found ${blocking.length} blocking violation(s) on ${route.path}:\n${summary}`,
        );
      }

      expect(blocking).toHaveLength(0);
    });
  }
});
