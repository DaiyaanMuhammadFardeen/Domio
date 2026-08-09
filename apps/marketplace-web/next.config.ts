import type { NextConfig } from 'next';

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

export default nextConfig;
