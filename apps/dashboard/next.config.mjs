/**
 * @domio/dashboard — Next.js 15 config (Phase 17 final).
 *
 * Transpiles the workspace packages we import directly so Next.js can
 * bundle their TypeScript sources without a build step.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@domio/chart', '@domio/observability'],
  experimental: {
    typedRoutes: true,
  },
  webpack: (config) => {
    // Workspace packages import each other with ESM-style `.js` extensions.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;