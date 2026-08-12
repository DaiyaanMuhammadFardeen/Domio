import { nextSecurityHeaders } from '@domio/web-security';
import withBundleAnalyzer from '@next/bundle-analyzer';
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
    // Skip CSP here — middleware sets it per-request with a nonce. The
    // remaining headers stay at static config time.
    const headers = nextSecurityHeaders({
      https: process.env.NODE_ENV === 'production',
    }).filter((h) => h.key !== 'Content-Security-Policy');
    return [{ source: '/:path*', headers }];
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

export default withBundleAnalyzer({ enabled: process.env.ANALYZE === 'true' })(nextConfig);
