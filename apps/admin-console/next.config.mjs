import { nextSecurityHeaders } from '@domio/web-security';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@domio/web-security'],
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

// Bundle analyzer is a devDep. Only require it (and the `next build`
// rewrite it triggers) when ANALYZE=true so the production container
// can install `--prod` without dragging devDeps in.
const nextConfigWithBundler =
  process.env.ANALYZE === 'true'
    ? (await import('@next/bundle-analyzer')).default({
        enabled: true,
      })(nextConfig)
    : nextConfig;

export default nextConfigWithBundler;
