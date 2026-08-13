import { test, expect } from '@playwright/test';

/**
 * P10-M6.1 — Quizzes e2e
 *
 * Smoke tests for the editor quiz + leaderboard panels. Confirms
 * the tabs mount, the panels render, and the panels accept editing
 * input that drives the underlying quiz/leaderboard state.
 */
test.describe('P10-M6.1 — Quizzes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/editor/demo');
    await page.waitForSelector('[data-testid="m6-quizzes-tab"]', { timeout: 10000 });
  });

  test('Quizzes + leaderboard tabs are visible', async ({ page }) => {
    await expect(page.locator('[data-testid="m6-quizzes-tab"]')).toBeVisible();
    await expect(page.locator('[data-testid="m6-leaderboard-tab"]')).toBeVisible();
  });

  test('Quizzes tab opens the quiz panel', async ({ page }) => {
    await page.click('[data-testid="m6-quizzes-tab"]');
    await expect(page.locator('[data-testid="m6-quiz-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="m6-quiz-name"]')).toBeVisible();
    await expect(page.locator('[data-testid="m6-quiz-threshold"]')).toBeVisible();
    await expect(page.locator('[data-testid="m6-quiz-add-question"]')).toBeVisible();
  });

  test('Adding a question appends a row', async ({ page }) => {
    await page.click('[data-testid="m6-quizzes-tab"]');
    const before = await page.locator('[data-testid^="m6-quiz-question-"]').count();
    await page.click('[data-testid="m6-quiz-add-question"]');
    // The new question will get a fresh id we can't predict, so count the data-testid prefix.
    await page.waitForFunction(
      (expected) =>
        document.querySelectorAll('[data-testid^="m6-quiz-question-"]').length > expected,
      before,
    );
    const after = await page.locator('[data-testid^="m6-quiz-question-"]').count();
    expect(after).toBe(before + 1);
  });

  test('Renaming the quiz emits an updated value', async ({ page }) => {
    await page.click('[data-testid="m6-quizzes-tab"]');
    const input = page.locator('[data-testid="m6-quiz-name"]');
    await input.fill('Renamed Quiz');
    await expect(input).toHaveValue('Renamed Quiz');
  });

  test('Leaderboard tab opens the leaderboard panel', async ({ page }) => {
    await page.click('[data-testid="m6-leaderboard-tab"]');
    await expect(page.locator('[data-testid="m6-leaderboard-panel"]')).toBeVisible();
  });
});
