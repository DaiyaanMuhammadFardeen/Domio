/**
 * Dashboard middleware — generates a per-request CSP nonce and propagates it
 * into Next.js's inline-script pipeline.
 *
 * Why this exists: Next.js 15 emits inline scripts for hydration, RSC
 * payloads, and webpack-hmr. The strict CSP in `@domio/web-security` blocks
 * those by default, which prevents React from hydrating → the DOM ends up
 * empty (only the `<head>` SSR HTML survives) → Playwright sees zero
 * `document.body.innerText`. Setting the nonce here and re-issuing the
 * matching `Content-Security-Policy` header unblocks hydration without
 * weakening the rest of the policy.
 *
 * Pattern is from Next.js docs:
 *   https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy
 */

import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp } from '@domio/web-security';

export function middleware(request: NextRequest) {
  // Cryptographically random base64 nonce. Per-request so replay can't
  // piggy-back a known nonce.
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64');

  // Allow local WebSocket targets (live-analytics at :8094) for dev. In
  // production these flow over the public wss://*.domio.example.com host.
  const isProd = process.env['NODE_ENV'] === 'production';
  const connectAllowlist = isProd
    ? ['https://*.domio.example.com', 'wss://*.domio.example.com']
    : ['https://*.domio.example.com', 'wss://*.domio.example.com', 'ws://localhost:*', 'wss://localhost:*'];

  // Pass the nonce to Next.js so it sets `nonce="…"` on every inline script
  // it generates (App Router hydration, RSC payload).
  const cspHeader = buildCsp({
    https: isProd,
    scriptNonce: nonce,
    allowlist: {
      connect: connectAllowlist,
      img: ['https://*.domio.example.com', 'data:', 'blob:'],
    },
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', cspHeader);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  // Re-emit the matching CSP on the way out (headers() in next.config
  // would otherwise win and clobber our nonce).
  response.headers.set('Content-Security-Policy', cspHeader);
  return response;
}

export const config = {
  matcher: [
    // Skip Next.js internals and static assets — they shouldn't get a
    // freshly-minted nonce header.
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
