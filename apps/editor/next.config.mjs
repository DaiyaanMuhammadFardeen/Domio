import { nextSecurityHeaders } from '@domio/web-security';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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
  webpack: (config, { isServer, webpack }) => {
    // Workspace packages import each other with ESM-style `.js` extensions.
    // Next's webpack resolves those to `.ts`/`.tsx` sources via extensionAlias.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    };
    // `@domio/deep-link` is server-only (its state-encoder uses Node
    // `crypto` for HMAC-SHA256), but is transitively imported from
    // client components such as `EditorRoot.tsx → ShareStateButton.tsx`.
    // On the client build, redirect `node:crypto` and bare `crypto`
    // imports to a stub so webpack doesn't choke on the unhandled scheme.
    // Runtime calls into the deep-link encoder in the browser will throw —
    // the share-link token minting is expected to move to a server endpoint.
    if (!isServer) {
      const here = path.dirname(fileURLToPath(import.meta.url));
      const stub = path.resolve(here, 'shims', 'crypto-stub.cjs');
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /^(node:)?crypto$/,
          stub,
        ),
      );
    }
    return config;
  },
};

export default nextConfig;
