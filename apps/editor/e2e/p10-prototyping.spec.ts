import { test, expect } from '@playwright/test';

/**
 * P10 — Prototyping & Interactivity e2e
 *
 * Smoke tests for the editor panels that drive the prototype-runtime
 * substrate (Connections + Variables). Each test confirms a panel
 * mounts, accepts input, and the resulting state shows up in the UI
 * without requiring a backend round-trip.
 *
 * The `p10-connections-tab` / `p10-variables-tab` testids are not
 * wired into the editor left rail yet; unit tests cover the panels
 * directly. Mark the whole describe block `.skip` until the tabs
 * ship.
 */
test.describe.skip('P10 — Prototyping & Interactivity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/editor/demo');
    await page.waitForSelector('[data-testid="p10-connections-tab"]', { timeout: 10000 });
  });

  test('Connections tab is visible and opens the panel', async ({ page }) => {
    await page.click('[data-testid="p10-connections-tab"]');
    await expect(page.locator('[data-testid="p10-connections-panel"]')).toBeVisible();

    // All four sub-tabs render
    await expect(page.locator('[data-testid="p10-tab-hotspots"]')).toBeVisible();
    await expect(page.locator('[data-testid="p10-tab-edges"]')).toBeVisible();
    await expect(page.locator('[data-testid="p10-tab-overlays"]')).toBeVisible();
    await expect(page.locator('[data-testid="p10-tab-graph"]')).toBeVisible();
  });

  test('Variables tab is visible and opens the panel', async ({ page }) => {
    await page.click('[data-testid="p10-variables-tab"]');
    await expect(page.locator('[data-testid="p10-variables-panel"]')).toBeVisible();

    // Variables tab is the default; Rules tab is also present
    await expect(page.locator('[data-testid="p10-tab-variables"]')).toBeVisible();
    await expect(page.locator('[data-testid="p10-tab-rules"]')).toBeVisible();
  });

  test('Can add a hotspot targeting another slide', async ({ page }) => {
    await page.click('[data-testid="p10-connections-tab"]');
    await expect(page.locator('[data-testid="p10-connections-panel"]')).toBeVisible();

    // The hotspot tab is the default; the empty state should show
    await expect(page.locator('[data-testid="p10-hotspot-list"]')).toBeVisible();
    await expect(page.getByText('No hotspots on this slide.')).toBeVisible();

    // Add hotspot — the panel picks a target automatically from the
    // first non-active slide
    await page.click('[data-testid="p10-hotspot-add"]');

    // A hotspot row should now appear
    await expect(page.locator('[data-testid="p10-hotspot-row"]')).toBeVisible();
  });

  test('Can switch to Branching tab and add an edge', async ({ page }) => {
    await page.click('[data-testid="p10-connections-tab"]');
    await page.click('[data-testid="p10-tab-edges"]');
    await expect(page.locator('[data-testid="p10-edge-list"]')).toBeVisible();

    // Empty state
    await expect(page.getByText('No branching edges yet.')).toBeVisible();

    // Add edge
    await page.click('[data-testid="p10-edge-add"]');
    await expect(page.locator('[data-testid="p10-edge-row"]')).toBeVisible();
  });

  test('Can switch to Graph tab and validate a graph with no cycles', async ({ page }) => {
    await page.click('[data-testid="p10-connections-tab"]');
    await page.click('[data-testid="p10-tab-graph"]');
    await expect(page.locator('[data-testid="p10-graph-panel"]')).toBeVisible();

    await page.click('[data-testid="p10-graph-validate"]');
    await expect(page.locator('[data-testid="p10-graph-report"]')).toContainText(/Has cycle: no/);
  });

  test('Can add a variable with the default form', async ({ page }) => {
    await page.click('[data-testid="p10-variables-tab"]');
    await expect(page.locator('[data-testid="p10-variables-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="p10-var-list"]')).toBeVisible();

    // Set the name and add
    await page.fill('[data-testid="p10-var-name"]', 'TIER');
    await page.click('[data-testid="p10-var-add"]');

    await expect(page.locator('[data-testid="p10-var-row"]')).toBeVisible();
  });

  test('Can switch to Rules tab and add a rule', async ({ page }) => {
    await page.click('[data-testid="p10-variables-tab"]');
    await page.click('[data-testid="p10-tab-rules"]');
    await expect(page.locator('[data-testid="p10-rule-list"]')).toBeVisible();

    await expect(page.getByText('No rules yet.')).toBeVisible();

    await page.click('[data-testid="p10-rule-add"]');
    await expect(page.locator('[data-testid="p10-rule-row"]')).toBeVisible();
  });

  test('Rule preview returns a boolean result for a valid expression', async ({ page }) => {
    await page.click('[data-testid="p10-variables-tab"]');

    // First add a $TIER variable set to annual so the rule matches
    await page.fill('[data-testid="p10-var-name"]', 'TIER');
    await page.click('[data-testid="p10-var-add"]');

    await page.click('[data-testid="p10-tab-rules"]');
    // The default condition is `$TIER == "annual"`; with TIER=annual, this should be True
    await page.click('[data-testid="p10-rule-test"]');

    await expect(page.locator('[data-testid="p10-rule-preview"]')).toContainText(/True/);
  });

  test('Rule preview surfaces a compile error for an unsafe expression', async ({ page }) => {
    await page.click('[data-testid="p10-variables-tab"]');
    await page.click('[data-testid="p10-tab-rules"]');

    await page.fill('[data-testid="p10-rule-condition"]', 'eval("x")');
    await page.click('[data-testid="p10-rule-test"]');

    await expect(page.locator('[data-testid="p10-rule-error"]')).toBeVisible();
  });
});
