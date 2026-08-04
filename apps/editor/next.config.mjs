/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@domio/canvas', '@domio/schema', '@domio/components', '@domio/schema-prop', '@domio/api-client'],
  experimental: {
    typedRoutes: true,
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