import { nextSecurityHeaders } from '@domio/web-security';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@domio/canvas',
    '@domio/schema',
    '@domio/components',
    '@domio/schema-prop',
    '@domio/api-client',
    '@domio/web-security',
  ],
  experimental: {
    typedRoutes: true,
  },
  async headers() {
    return [
      {
        // Apply to every route in this Next.js app.
        source: '/:path*',
        headers: nextSecurityHeaders({
          https: process.env.NODE_ENV === 'production',
          allowlist: {
            connect: ['https://*.domio.example.com', 'wss://*.domio.example.com'],
            img: ['https://*.domio.example.com', 'data:', 'blob:'],
          },
        }),
      },
    ];
  },
  webpack: (config) => {
    // Workspace packages import each other with ESM-style `.js` extensions.
    // Next's webpack resolves those to `.ts`/`.tsx` sources via extensionAlias.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
