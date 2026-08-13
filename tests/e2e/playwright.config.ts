import { defineConfig, devices } from '@playwright/test';

/**
 * Phase 17 — e2e Playwright configuration.
 *
 * Reuses the same Playwright version pinned in tests/a11y and the
 * axe-core workflow (1.49.1). Adds a `dashboard` project that runs
 * the apps/dashboard spec suite (navigation, export, A/B decision).
 *
 * The dashboard itself is run on port 3003 (separate from the
 * editor's :3000 used by the existing axe workflow) to avoid
 * port clashes when both suites run back-to-back.
 */
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts$/,
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
      name: 'dashboard',
      testMatch: /dashboard\/.*\.spec\.ts$/,
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
