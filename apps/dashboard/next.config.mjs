/**
 * @domio/dashboard — Next.js 15 config (Phase 17 final).
 *
 * Transpiles the workspace packages we import directly so Next.js can
 * bundle their TypeScript sources without a build step.
 *
 * P20.5 B5: applies strict security headers (HSTS, X-Frame-Options,
 * X-Content-Type-Options, Referrer-Policy, Permissions-Policy).
 * Content-Security-Policy is emitted dynamically by `src/middleware.ts`
 * because it needs a per-request nonce for inline scripts.
 */

import { nextSecurityHeaders } from '@domio/web-security';
import withBundleAnalyzer from '@next/bundle-analyzer';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@domio/chart', '@domio/observability', '@domio/web-security'],
  experimental: {
    typedRoutes: true,
  },
  async headers() {
    // Skip CSP here — middleware sets it per-request with a nonce. The
    // remaining headers stay at static config time.
    const headers = nextSecurityHeaders({
      https: process.env.NODE_ENV === 'production',
    }).filter((h) => h.key !== 'Content-Security-Policy');
    return [{ source: '/:path*', headers }];
  },
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default withBundleAnalyzer({ enabled: process.env.ANALYZE === 'true' })(nextConfig);