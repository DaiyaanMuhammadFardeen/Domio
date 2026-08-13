/**
 * External-user e2e — marketplace-web.
 *
 * Public marketplace for browsing/selling templates and components.
 * Tests cover: home search, listing detail, theme catalog, library,
 * search, sellers directory.
 */
import { test, expect } from '@playwright/test';

test.describe('marketplace-web — external user', () => {
  test('home renders search + listings', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('main')).toBeVisible();
  });

  test('search route renders', async ({ page }) => {
    const res = await page.goto('/search');
    expect(res?.status() ?? 0).toBeLessThan(500);
  });

  test('search route with query renders', async ({ page }) => {
    const res = await page.goto('/search?q=pitch+deck');
    expect(res?.status() ?? 0).toBeLessThan(500);
  });

  test('theme catalog loads', async ({ page }) => {
    const res = await page.goto('/theme');
    expect(res?.status() ?? 0).toBeLessThan(500);
  });

  test('listing detail loads', async ({ page }) => {
    const res = await page.goto('/listing/sample-listing-id');
    expect(res?.status() ?? 0).toBeLessThan(500);
  });

  test('library page loads', async ({ page }) => {
    const res = await page.goto('/library');
    expect(res?.status() ?? 0).toBeLessThan(500);
  });

  test('sellers directory loads', async ({ page }) => {
    const res = await page.goto('/sellers');
    expect(res?.status() ?? 0).toBeLessThan(500);
  });

  test('creators directory loads', async ({ page }) => {
    const res = await page.goto('/creators');
    expect(res?.status() ?? 0).toBeLessThan(500);
  });

  test('checkout route renders (will likely require auth)', async ({ page }) => {
    const res = await page.goto('/checkout/listing-123');
    // Either redirects to login or shows checkout — never 5xx
    expect(res?.status() ?? 0).toBeLessThan(500);
  });

  test('handles unicode listing id without crashing', async ({ page }) => {
    const res = await page.goto('/listing/演示-listing-орг');
    expect(res?.status() ?? 0).toBeLessThan(500);
  });
});
