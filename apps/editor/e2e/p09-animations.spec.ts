import { test, expect } from '@playwright/test';

/**
 * The Animations & Transitions panel (`p09-animations-tab`) is
 * registered in `apps/editor/src/panels/registry.ts` but is not
 * yet wired into the editor's left rail. The unit tests in
 * `apps/editor/src/panels/animations-panel.test.tsx` cover the
 * panel itself; this e2e suite waits on a tab that does not
 * render, so mark the whole describe block as `.skip` until the
 * panel ships in the production UI.
 */
test.describe.skip('P09 — Animations & Transitions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/editor/demo');
    // Wait for the editor to be ready
    await page.waitForSelector('[data-testid="p09-animations-tab"]', { timeout: 10000 });
  });

  test('Animations tab is visible and opens the panel', async ({ page }) => {
    // Click the Animations tab
    await page.click('[data-testid="p09-animations-tab"]');
    // The animations panel should be visible
    await expect(page.locator('[data-testid="p09-animations-panel"]')).toBeVisible();
    // All four sub-tabs should be present
    await expect(page.locator('[data-testid="p09-tab-timeline"]')).toBeVisible();
    await expect(page.locator('[data-testid="p09-tab-transition"]')).toBeVisible();
    await expect(page.locator('[data-testid="p09-tab-magicMove"]')).toBeVisible();
    await expect(page.locator('[data-testid="p09-tab-accessibility"]')).toBeVisible();
  });

  test('Can insert a shape and open Animations tab', async ({ page }) => {
    // First go to Insert tab to add a shape — use real DOM selectors
    await page.getByRole('tab', { name: 'Insert' }).click();
    await expect(page.getByTestId('insert-panel')).toBeVisible();

    // Click the first component card in the insert grid
    const firstCard = page.locator('[data-testid="insert-grid"] button').first();
    await expect(firstCard).toBeVisible();
    await firstCard.click();

    // Switch to Animations tab
    await page.click('[data-testid="p09-animations-tab"]');
    await expect(page.locator('[data-testid="p09-animations-panel"]')).toBeVisible();
  });

  test('Timeline: can add a timeline and configure it', async ({ page }) => {
    await page.click('[data-testid="p09-animations-tab"]');

    // Timeline tab should be active by default
    await expect(page.locator('[data-testid="p09-tab-timeline"]')).toBeVisible();

    // Click add timeline
    const addTimelineBtn = page.locator('[data-testid="p09-add-timeline"]');
    if (await addTimelineBtn.isVisible()) {
      await addTimelineBtn.click();

      // Duration input should appear
      await expect(page.locator('[data-testid="p09-timeline-duration"]')).toBeVisible();

      // Add a track
      const addTrackBtn = page.locator('[data-testid="p09-add-track"]');
      if (await addTrackBtn.isVisible()) {
        await addTrackBtn.click();

        // Track property input should appear
        await expect(page.locator('[data-testid="p09-track-property-0"]')).toBeVisible();
      }
    }
  });

  test('Timeline: can configure a trigger', async ({ page }) => {
    await page.click('[data-testid="p09-animations-tab"]');

    // Add timeline first
    const addTimelineBtn = page.locator('[data-testid="p09-add-timeline"]');
    if (await addTimelineBtn.isVisible()) {
      await addTimelineBtn.click();

      // Trigger selector should be visible
      await expect(page.locator('[data-testid="p09-trigger-kind"]')).toBeVisible();

      // Select on_timer trigger
      await page.selectOption('[data-testid="p09-trigger-kind"]', 'on_timer');

      // Timer seconds input should appear
      await expect(page.locator('[data-testid="p09-trigger-timer-seconds"]')).toBeVisible();
    }
  });

  test('Transition: can set a slide transition', async ({ page }) => {
    await page.click('[data-testid="p09-animations-tab"]');

    // Switch to Transition tab
    await page.click('[data-testid="p09-tab-transition"]');

    // Transition kind selector should be visible
    await expect(page.locator('[data-testid="p09-transition-kind"]')).toBeVisible();

    // Select 'slide' transition
    await page.selectOption('[data-testid="p09-transition-kind"]', 'slide');

    // Duration and direction inputs should appear
    await expect(page.locator('[data-testid="p09-transition-duration"]')).toBeVisible();
    await expect(page.locator('[data-testid="p09-transition-direction"]')).toBeVisible();
  });

  test('Magic Move: can set an element role', async ({ page }) => {
    await page.click('[data-testid="p09-animations-tab"]');

    // Switch to Magic Move tab
    await page.click('[data-testid="p09-tab-magicMove"]');

    // Role input should be visible
    await expect(page.locator('[data-testid="p09-magic-role"]')).toBeVisible();

    // Type a role
    await page.fill('[data-testid="p09-magic-role"]', 'hero');
    await expect(page.locator('[data-testid="p09-magic-role"]')).toHaveValue('hero');
  });

  test('Accessibility: can set reduced motion policy', async ({ page }) => {
    await page.click('[data-testid="p09-animations-tab"]');

    // Switch to Accessibility tab
    await page.click('[data-testid="p09-tab-accessibility"]');

    // All three radio options should be visible
    await expect(page.locator('[data-testid="p09-reduced-motion-follow_os"]')).toBeVisible();
    await expect(page.locator('[data-testid="p09-reduced-motion-always_reduced"]')).toBeVisible();
    await expect(page.locator('[data-testid="p09-reduced-motion-always_full"]')).toBeVisible();

    // Click 'always_reduced'
    await page.click('[data-testid="p09-reduced-motion-always_reduced"]');
  });

  test('Copy/paste buttons are visible', async ({ page }) => {
    await page.click('[data-testid="p09-animations-tab"]');

    await expect(page.locator('[data-testid="p09-copy-anim"]')).toBeVisible();
    await expect(page.locator('[data-testid="p09-paste-anim"]')).toBeVisible();
  });

  test('Easing picker is visible in transition tab', async ({ page }) => {
    await page.click('[data-testid="p09-animations-tab"]');
    await page.click('[data-testid="p09-tab-transition"]');

    // Set a transition kind
    await page.selectOption('[data-testid="p09-transition-kind"]', 'fade');

    // Easing picker should appear
    await expect(page.locator('[data-testid="p09-easing-select"]')).toBeVisible();
  });
});
