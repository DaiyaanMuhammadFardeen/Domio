import { defineConfig } from '@playwright/test';

/**
 * Playwright config for `apps/editor/e2e/`.
 *
 * The e2e specs are wired into CI by `.github/workflows/editor-e2e.yml`
 * (P22-beta WS-A). Locally:
 *
 *   pnpm --filter @domio/editor test:e2e:install  # one-time browser install
 *   pnpm --filter @domio/editor test:e2e
 *
 * The dev server is started via `pnpm dev:3100` (which maps to
 * `next dev -p 3100`). CI overrides `baseURL` to point at the
 * staging deployment, so the dev server is skipped in CI.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3100',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev:3100',
        url: 'http://localhost:3100',
        reuseExistingServer: true,
        timeout: 120_000,
      },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
