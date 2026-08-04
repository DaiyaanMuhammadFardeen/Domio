import { test, expect } from '@playwright/test';

test.describe('P10/M8 Simulate & Deck Diff', () => {
  test('renders the deck diff tab', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-testid="m8-deck-diff-tab"]');
    await expect(page.locator('[data-testid="m8-diff-input-a"]')).toBeVisible();
    await expect(page.locator('[data-testid="m8-diff-input-b"]')).toBeVisible();
  });

  test('compares two decks and renders results', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-testid="m8-deck-diff-tab"]');
    await page.fill('[data-testid="m8-diff-input-a"]', 'deck-a');
    await page.fill('[data-testid="m8-diff-input-b"]', 'deck-b');
    await page.click('[data-testid="m8-diff-compare"]');
    await expect(page.locator('[data-testid="m8-diff-result"]')).toBeVisible();
  });

  test('disables compare when input is empty', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-testid="m8-deck-diff-tab"]');
    await expect(page.locator('[data-testid="m8-diff-compare"]')).toBeDisabled();
  });
});
