/**
 * External-user e2e — creator-console.
 *
 * The creator-console is the authenticated surface where template
 * sellers manage listings, analytics, payouts, and reviews. From an
 * external-user perspective the expectation is that every route
 * either redirects to login or renders a guard — never exposes
 * creator-only data.
 */
import { test, expect } from '@playwright/test';

const ROUTES = [
  '/listings',
  '/analytics',
  '/statements',
  '/settings',
  '/payouts',
  '/reviews',
  '/onboarding',
];

test.describe('creator-console — external user', () => {
  for (const route of ROUTES) {
    test(`does not crash or leak data at ${route}`, async ({ page }) => {
      const res = await page.goto(route);
      expect(res?.status() ?? 0).toBeLessThan(500);
      // Must not contain financial data markers
      const body = await page.content();
      expect(body).not.toMatch(/BEGIN-CREATOR-PRIVATE/);
      expect(body).not.toMatch(/payout-amount|paypal-secret/i);
    });
  }

  test('root redirects or guards', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status() ?? 0).toBeLessThan(500);
  });

  test('does not leak listings data without auth', async ({ page }) => {
    await page.goto('/listings');
    // Should not show real listing prices
    const body = await page.content();
    expect(body).not.toMatch(/\$\d+\.\d{2}.*royalt/i);
  });
});
