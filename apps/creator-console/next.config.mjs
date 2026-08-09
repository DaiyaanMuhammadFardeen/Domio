/**
 * @domio/creator-console — Next.js 15 config.
 *
 * P20.5 B5: applies strict security headers (CSP, HSTS, X-Frame-Options,
 * X-Content-Type-Options, Referrer-Policy, Permissions-Policy).
 */

import { nextSecurityHeaders } from '@domio/web-security';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@domio/chart', '@domio/observability', '@domio/web-security'],
  experimental: {
    typedRoutes: true,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: nextSecurityHeaders({
          https: process.env.NODE_ENV === 'production',
          allowlist: {
            connect: ['https://*.domio.example.com'],
            img: ['https://*.domio.example.com', 'data:', 'blob:'],
          },
        }),
      },
    ];
  },
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;