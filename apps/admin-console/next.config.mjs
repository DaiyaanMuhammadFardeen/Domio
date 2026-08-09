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

export default nextConfig;
