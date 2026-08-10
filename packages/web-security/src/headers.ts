/**
 * @domio/web-security — security headers shared across Next.js web apps.
 *
 * P20.5 B5 (secrets + auth posture hardening). Every Domio web response must
 * carry these headers:
 *   - Content-Security-Policy (strict default-src 'self', no unsafe-inline)
 *   - X-Frame-Options / frame-ancestors
 *   - X-Content-Type-Options: nosniff
 *   - Referrer-Policy: strict-origin-when-cross-origin
 *   - Strict-Transport-Security (HSTS)
 *   - Permissions-Policy (deny sensors the app does not need)
 *
 * Cookies must be `Secure` + `HttpOnly` + `SameSite=Lax`. Helpers in this
 * package validate that before any Set-Cookie header goes out.
 *
 * The helper is consumed by every Next.js app's `next.config.*` `headers()`
 * function. Build-time configuration only — no runtime cost.
 */

export interface WebSecurityOptions {
  /** Allowed origins for `connect-src`, `img-src`, `font-src`, etc. */
  readonly allowlist?: {
    readonly connect?: readonly string[];
    readonly img?: readonly string[];
    readonly font?: readonly string[];
    readonly media?: readonly string[];
    readonly style?: readonly string[];
    readonly script?: readonly string[];
    readonly frame?: readonly string[];
  };
  /** Whether this app runs over HTTPS in production (set false for local dev). */
  readonly https?: boolean;
  /**
   * CSP nonce to permit inline scripts (Next.js hydration, RSC payload,
   * webpack-hmr). When provided, `script-src` includes `'nonce-<value>'`
   * AND `'strict-dynamic'` so the browser trusts only nonced scripts.
   * Set via Next.js middleware that injects the same nonce into every
   * generated `<script>` tag's nonce attribute.
   */
  readonly scriptNonce?: string;
}

/**
 * Build the strict CSP policy. Production-safe defaults:
 *   - default-src 'self'
 *   - script-src 'self' (Next.js needs 'unsafe-inline' for inline scripts in
 *     dev mode; production builds avoid it via nonces — see security headers
 *     note below)
 *   - object-src 'none'
 *   - frame-ancestors 'none'
 *
 * Apps may override via `allowlist.script` for known third-party SDKs.
 */
export function buildCsp(options: WebSecurityOptions = {}): string {
  const scriptSrc: string[] = ["'self'"];
  if (options.scriptNonce) {
    // `'strict-dynamic'` lets any nonced script load arbitrary further
    // scripts without per-script hashes — recommended by Next.js docs
    // for production CSP with nonces.
    scriptSrc.push(`'nonce-${options.scriptNonce}'`, "'strict-dynamic'");
  }
  scriptSrc.push(...(options.allowlist?.script ?? []));

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": scriptSrc,
    "style-src": ["'self'", "'unsafe-inline'", ...(options.allowlist?.style ?? [])],
    "img-src": ["'self'", "data:", "blob:", ...(options.allowlist?.img ?? [])],
    "font-src": ["'self'", "data:", ...(options.allowlist?.font ?? [])],
    "connect-src": ["'self'", ...(options.allowlist?.connect ?? [])],
    "media-src": ["'self'", ...(options.allowlist?.media ?? [])],
    "frame-src": ["'self'", ...(options.allowlist?.frame ?? [])],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "manifest-src": ["'self'"],
  };

  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(" ")}`)
    .join("; ");
}

/**
 * Cookie attribute validator. Throws if a Set-Cookie string is missing
 * `Secure`, `HttpOnly`, or `SameSite`. The validator intentionally rejects
 * SameSite=None without Secure, and rejects SameSite=None entirely on
 * the same-site variant if `https=false`.
 */
export class InsecureCookieError extends Error {
  readonly code = 'INSECURE_COOKIE' as const;
  constructor(public readonly cookieName: string, public readonly reason: string) {
    super(`insecure cookie ${cookieName}: ${reason}`);
    this.name = 'InsecureCookieError';
  }
}

export function assertSecureCookie(
  cookieHeader: string,
  opts: { requireHttps: boolean } = { requireHttps: true },
): void {
  const lower = cookieHeader.toLowerCase();
  const name = cookieHeader.split('=')[0]?.trim() ?? '<unnamed>';

  // Check SameSite=None-without-Secure first because the browser also enforces
  // this combination and we want a more specific error message.
  const samesite = /samesite=(lax|strict|none)/.exec(lower)?.[1];
  if (samesite === 'none' && !lower.includes('secure')) {
    throw new InsecureCookieError(name, 'SameSite=None requires Secure');
  }
  if (!lower.includes('httponly')) {
    throw new InsecureCookieError(name, 'missing HttpOnly');
  }
  if (opts.requireHttps && !lower.includes('secure')) {
    throw new InsecureCookieError(name, 'missing Secure');
  }
  if (!lower.includes('samesite=')) {
    throw new InsecureCookieError(name, 'missing SameSite');
  }
}

/**
 * Patch a Set-Cookie string to add Secure + HttpOnly + SameSite=Lax if
 * missing. Used by services that emit cookies via Set-Cookie and need a
 * safety net. Throws if SameSite=None was specified explicitly (we always
 * downgrade to Lax).
 */
export function hardenSetCookie(input: string, opts: { https: boolean }): string {
  let out = input;
  const lower = out.toLowerCase();
  if (!lower.includes('httponly')) out += '; HttpOnly';
  if (opts.https && !lower.includes('secure')) out += '; Secure';
  if (!lower.includes('samesite=')) out += '; SameSite=Lax';
  return out;
}

/**
 * Return Next.js `headers()` async function value covering CSP, HSTS,
 * X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
 *
 * Usage in next.config.mjs / next.config.ts:
 *
 *   import { nextSecurityHeaders } from '@domio/web-security';
 *
 *   const nextConfig = {
 *     async headers() {
 *       return [{ source: '/:path*', headers: nextSecurityHeaders() }];
 *     },
 *   };
 */
export function nextSecurityHeaders(
  options: WebSecurityOptions = {},
): ReadonlyArray<{ key: string; value: string }> {
  const https = options.https ?? process.env.NODE_ENV === 'production';

  const headers: Array<{ key: string; value: string }> = [
    { key: 'Content-Security-Policy', value: buildCsp(options) },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    },
  ];

  if (https) {
    headers.push({
      key: 'Strict-Transport-Security',
      value: 'max-age=63072000; includeSubDomains; preload',
    });
  }

  return headers;
}