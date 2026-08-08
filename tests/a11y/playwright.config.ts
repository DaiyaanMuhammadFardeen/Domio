import { defineConfig, devices } from '@playwright/test';

/**
 * Phase 17 — axe-core a11y configuration.
 *
 * Boots apps/dashboard on http://localhost:3003 (the dashboard's
 * dev port, separate from the editor's :3000) and runs the
 * dashboard.axe.spec.ts suite against chromium only.
 *
 * Re-uses the same Playwright version (.github/workflows/axe.yml pins
 * @playwright/test 1.49.1 via npx). CI starts the dashboard with
 *   pnpm --filter @domio/dashboard dev &
 * before running playwright.
 */
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.axe\.spec\.ts$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.DASHBOARD_BASE_URL ?? 'http://localhost:3003',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chromium',
      },
    },
  ],
  webServer: process.env.CI
    ? undefined
    : {
        command: 'pnpm --filter @domio/dashboard dev -- --port 3003',
        url: 'http://localhost:3003',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
