import { test, expect } from '@playwright/test';

/**
 * P10-M3 — Component state machines e2e
 *
 * Smoke tests for the editor state-inspector panel. Confirms the
 * panel mounts, accepts input, and renders the transition graph
 * driven by the same precedence ladder that the runtime resolves
 * (`focus > press > click > hover > default`).
 */
test.describe('P10-M3 — Component state machines', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/editor/demo');
    await page.waitForSelector('[data-testid="m3-state-inspector-tab"]', { timeout: 10000 });
  });

  test('State-inspector tab is visible and opens the panel', async ({ page }) => {
    await page.click('[data-testid="m3-state-inspector-tab"]');
    await expect(page.locator('[data-testid="m3-state-inspector-panel"]')).toBeVisible();

    // Empty state shows on first open
    await expect(page.getByText('No state machines on this slide.')).toBeVisible();
  });

  test('Add-machine form exposes instance id, initial state, and scope', async ({ page }) => {
    await page.click('[data-testid="m3-state-inspector-tab"]');
    await expect(page.locator('[data-testid="m3-instance-id"]')).toBeVisible();
    await expect(page.locator('[data-testid="m3-initial-state"]')).toBeVisible();
    await expect(page.locator('[data-testid="m3-scope"]')).toBeVisible();
    await expect(page.locator('[data-testid="m3-add-machine"]')).toBeVisible();
  });

  test('Adding a machine creates a row with a transition graph', async ({ page }) => {
    await page.click('[data-testid="m3-state-inspector-tab"]');
    await page.fill('[data-testid="m3-instance-id"]', 'inst-s1-1');
    await page.fill('[data-testid="m3-initial-state"]', 'idle');
    await page.click('[data-testid="m3-add-machine"]');

    // Machine row appears, transition graph mounts.
    await expect(page.locator('[data-testid="m3-machine-row"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="m3-transition-graph"]')).toBeVisible();

    // The default handler seeds two transitions: idle→active (click) and
    // active→idle (default). Both must show up.
    const rows = page.locator('[data-testid="m3-transition-row"]');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('click');
  });

  test('Pause-and-inspect disables the apply-event button', async ({ page }) => {
    await page.click('[data-testid="m3-state-inspector-tab"]');
    await page.fill('[data-testid="m3-instance-id"]', 'inst-s1-1');
    await page.fill('[data-testid="m3-initial-state"]', 'idle');
    await page.click('[data-testid="m3-add-machine"]');

    await expect(page.locator('[data-testid="m3-advance"]')).toBeEnabled();
    await page.click('[data-testid="m3-pause-toggle"]');
    await expect(page.locator('[data-testid="m3-advance"]')).toBeDisabled();
    await expect(page.locator('[data-testid="m3-paused-flag"]')).toBeVisible();
  });

  test('Removing a machine clears the row and returns to the empty state', async ({ page }) => {
    await page.click('[data-testid="m3-state-inspector-tab"]');
    await page.fill('[data-testid="m3-instance-id"]', 'inst-s1-1');
    await page.fill('[data-testid="m3-initial-state"]', 'idle');
    await page.click('[data-testid="m3-add-machine"]');

    await expect(page.locator('[data-testid="m3-machine-row"]')).toHaveCount(1);
    await page.click('[data-testid="m3-machine-remove"]');
    await expect(page.locator('[data-testid="m3-machine-row"]')).toHaveCount(0);
    await expect(page.getByText('No state machines on this slide.')).toBeVisible();
  });

  test('Persist-instance-state toggle flips the per-row checkbox', async ({ page }) => {
    await page.click('[data-testid="m3-state-inspector-tab"]');
    await page.fill('[data-testid="m3-instance-id"]', 'inst-s1-1');
    await page.fill('[data-testid="m3-initial-state"]', 'idle');
    await page.click('[data-testid="m3-add-machine"]');

    const toggle = page.locator('[data-testid="m3-persist-toggle"]').first();
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await expect(toggle).toBeChecked();
  });
});