/**
 * @domio/magic-link-landing — Next.js 15 config.
 *
 * The webpack `extensionAlias` block maps `.js` imports to `.ts`/`.tsx`
 * source files so the app can import from workspace packages that use
 * `bundler` module resolution in their tsconfig (which is the
 * convention across this monorepo).
 *
 * Security headers are applied at the edge (CDN/ingress) rather than
 * here — this app does not need a Next.js middleware layer.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@domio/ui'],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;