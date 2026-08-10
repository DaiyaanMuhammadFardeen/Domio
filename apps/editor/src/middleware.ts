/**
 * Editor middleware — generates a per-request CSP nonce and propagates it
 * into Next.js's inline-script pipeline. See dashboard middleware for
 * detailed rationale; this is the editor's identical implementation.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp } from '@domio/web-security';

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64');

  // Allow local WebSocket targets in dev (presenter-session, etc.).
  const isProd = process.env['NODE_ENV'] === 'production';
  const connectAllowlist = isProd
    ? ['https://*.domio.example.com', 'wss://*.domio.example.com']
    : ['https://*.domio.example.com', 'wss://*.domio.example.com', 'ws://localhost:*', 'wss://localhost:*'];

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
  response.headers.set('Content-Security-Policy', cspHeader);
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
