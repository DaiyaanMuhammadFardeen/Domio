import { defineConfig } from '@playwright/test';

/**
 * Playwright config for `tests/e2e/admin-console/`.
 */
export default defineConfig({
  testDir: '../../tests/e2e/admin-console',
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3500',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
