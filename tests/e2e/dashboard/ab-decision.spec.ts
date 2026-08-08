/**
 * Phase 17 — e2e /dashboard/ab-decision.
 *
 * Happy path: open /ab, click an experiment row, assert the
 * decision badge appears with one of the canonical phase-17
 * outcomes:
 *   - significant   (mSPRT rejected H0)
 *   - underpowered  (sample size hasn't reached the planned horizon)
 *   - inconclusive  (sequential test still running, no decision yet)
 *
 * The dashboard renders the badge as a [data-testid="ab-decision-<key>"]
 * element inside the experiment detail panel.
 */
import { test, expect } from '@playwright/test';

const VALID_DECISIONS = new Set(['significant', 'underpowered', 'inconclusive']);

test.describe('dashboard — A/B decision flow', () => {
  test('clicking an experiment shows a decision badge', async ({ page }) => {
    await page.goto('/ab');
    // Wait for the experiment table to mount.
    await page.waitForSelector('[data-testid="ab-experiment-row"], table tbody tr', {
      timeout: 15_000,
    });

    // Click the first experiment row.
    const firstRow = page.locator('[data-testid="ab-experiment-row"], table tbody tr').first();
    await firstRow.click();

    // The decision badge is rendered with a data-testid of the form
    // `ab-decision-<key>`.  We wait for any of the three canonical
    // selectors to appear.
    const badge = await Promise.race([
      page.waitForSelector('[data-testid="ab-decision-significant"]', { timeout: 15_000 }),
      page.waitForSelector('[data-testid="ab-decision-underpowered"]', { timeout: 15_000 }),
      page.waitForSelector('[data-testid="ab-decision-inconclusive"]', { timeout: 15_000 }),
    ]);

    expect(badge).not.toBeNull();

    // Identify which decision this is by inspecting the testid.
    const testId = await badge.getAttribute('data-testid');
    const key = (testId ?? '').replace(/^ab-decision-/, '');
    expect(VALID_DECISIONS.has(key)).toBe(true);
  });
});
