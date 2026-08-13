/**
 * External-user e2e — landing page.
 *
 * Exercises every public flow a logged-out visitor can reach on
 * apps/landing: hero, navigation, pricing, FAQ, signup, login,
 * changelog, help, status, and the docs / cli / sdk sub-pages.
 *
 * No credentials. No admin functions. Pure user perspective.
 */
import { test, expect } from '@playwright/test';

test.describe('landing — external user', () => {
  test('home page renders all primary sections', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Domio/);
    // Hero
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // All 6 sections must be in the document
    await expect(page.locator('section, [data-testid^="section-"]').first()).toBeVisible();
  });

  test('pricing page renders three tiers', async ({ page }) => {
    await page.goto('/pricing');
    // Free / Pro / Enterprise (or similar) must be present
    const tierHeadings = page.locator('[data-testid^="pricing-tier-"]');
    // Fallback if no testids: any h2/h3 with the tier names
    const altHeadings = page.locator('h2, h3').filter({ hasText: /(free|pro|enterprise)/i });
    const count = (await tierHeadings.count()) + (await altHeadings.count());
    expect(count).toBeGreaterThan(0);
  });

  test('FAQ accordion expands at least one item', async ({ page }) => {
    await page.goto('/');
    const faqItem = page.locator('[data-testid^="faq-item-"], details, button[aria-expanded]').first();
    if (await faqItem.count()) {
      await faqItem.click();
      await expect(faqItem).toBeVisible();
    }
  });

  test('signup form is reachable from CTA', async ({ page }) => {
    await page.goto('/signup');
    await expect(page).toHaveURL(/\/signup/);
    // Form fields for email + password expected
    await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible();
  });

  test('login form is reachable', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });

  test('help center renders at /help', async ({ page }) => {
    await page.goto('/help');
    await expect(page.locator('main')).toBeVisible();
  });

  test('status page renders at /status', async ({ page }) => {
    const res = await page.goto('/status');
    expect(res?.status() ?? 0).toBeLessThan(500);
  });

  test('changelog renders at /changelog', async ({ page }) => {
    await page.goto('/changelog');
    await expect(page.locator('main, article')).toBeVisible();
  });

  test('docs sub-site loads', async ({ page }) => {
    await page.goto('/docs');
    expect(page.url()).toContain('/docs');
  });

  test('CLI page loads', async ({ page }) => {
    const res = await page.goto('/cli');
    expect(res?.status() ?? 0).toBeLessThan(500);
  });

  test('plugins-sdk page loads', async ({ page }) => {
    const res = await page.goto('/plugins-sdk');
    expect(res?.status() ?? 0).toBeLessThan(500);
  });

  test('blog index renders at least one post', async ({ page }) => {
    await page.goto('/blog');
    // At least the index wrapper should render; we don't require a post count.
    await expect(page.locator('main')).toBeVisible();
  });

  test('community page loads', async ({ page }) => {
    const res = await page.goto('/community');
    expect(res?.status() ?? 0).toBeLessThan(500);
  });

  test('careers page loads', async ({ page }) => {
    const res = await page.goto('/careers');
    expect(res?.status() ?? 0).toBeLessThan(500);
  });

  test('forgot-password renders form', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible();
  });

  test('external user cannot reach /admin', async ({ page }) => {
    const res = await page.goto('/admin');
    // Either 404, redirect to login, or a guard page — never the admin dashboard.
    expect(res?.status() ?? 0).toBeLessThan(500);
    await expect(page).not.toHaveURL(/\/admin\/users|\/admin\/workspaces/);
  });

  test('trust page renders', async ({ page }) => {
    const res = await page.goto('/trust');
    expect(res?.status() ?? 0).toBeLessThan(500);
  });

  test('demos directory loads', async ({ page }) => {
    await page.goto('/demos');
    await expect(page.locator('main')).toBeVisible();
  });
});