import type { NextConfig } from 'next';
import withBundleAnalyzer from '@next/bundle-analyzer';
import { nextSecurityHeaders } from '@domio/web-security';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.domio.example.com',
      },
    ],
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
  // Workspace packages that use .js extensions in TS source (ESM convention)
  // need webpack alias resolution so the bundled build can find the .ts files.
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
    };
    // Resolve .js extension imports within workspace .ts source files
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default withBundleAnalyzer({ enabled: process.env.ANALYZE === 'true' })(nextConfig);
