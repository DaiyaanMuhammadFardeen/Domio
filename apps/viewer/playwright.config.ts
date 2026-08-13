import { defineConfig } from '@playwright/test';

/**
 * Playwright config for `tests/e2e/viewer/`.
 *
 * Per Wave 1 §S1.7 of docs/frontend-roadmap/01-wave-productionization.md.
 */
export default defineConfig({
  testDir: '../../tests/e2e/viewer',
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3200',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
