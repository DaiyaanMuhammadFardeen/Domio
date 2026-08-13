import { defineConfig, devices } from '@playwright/test';

/**
 * Domio external-user e2e Playwright configuration.
 *
 * One project per public-facing app. Each project pins a baseURL so
 * the same spec can run against any surface without webServer
 * gymnastics. The `external` user persona never has admin
 * credentials; we exercise every visible flow a logged-out visitor
 * can reach (smoke + interactive flows).
 *
 * Apps with existing deeper coverage (editor — apps/editor/e2e/)
 * keep their own dedicated workflow but are also smoke-tested here
 * as a regression gate.
 */

const APP_PORT: Record<string, number> = {
  dashboard: 3003,
  viewer: 3005,
  presenter: 3006,
  landing: 3007,
  'join-web': 3008,
  'admin-console': 3009,
  'marketplace-web': 3010,
  'creator-console': 3011,
  'magic-link-landing': 3012,
};

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
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
        baseURL: process.env.DASHBOARD_BASE_URL ?? 'http://localhost:3003',
      },
    },
    {
      name: 'viewer',
      testMatch: /viewer\/.*\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.VIEWER_BASE_URL ?? 'http://localhost:3005',
      },
    },
    {
      name: 'presenter',
      testMatch: /presenter\/.*\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.PRESENTER_BASE_URL ?? 'http://localhost:3006',
      },
    },
    {
      name: 'landing',
      testMatch: /landing\/.*\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.LANDING_BASE_URL ?? 'http://localhost:3007',
      },
    },
    {
      name: 'join-web',
      testMatch: /join-web\/.*\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.JOIN_BASE_URL ?? 'http://localhost:3008',
      },
    },
    {
      name: 'admin-console',
      testMatch: /admin-console\/.*\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.ADMIN_BASE_URL ?? 'http://localhost:3009',
      },
    },
    {
      name: 'marketplace-web',
      testMatch: /marketplace-web\/.*\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.MARKETPLACE_BASE_URL ?? 'http://localhost:3010',
      },
    },
    {
      name: 'creator-console',
      testMatch: /creator-console\/.*\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.CREATOR_BASE_URL ?? 'http://localhost:3011',
      },
    },
    {
      name: 'magic-link-landing',
      testMatch: /magic-link-landing\/.*\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.MAGIC_BASE_URL ?? 'http://localhost:3012',
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

export { APP_PORT };