/**
 * @domio/web-security — public surface.
 *
 * P20.5 B5 (secrets + auth posture hardening). Helpers for CSP, cookies,
 * and security headers consumed by every Next.js web app.
 */

export {
  buildCsp,
  assertSecureCookie,
  hardenSetCookie,
  nextSecurityHeaders,
  InsecureCookieError,
} from './headers.js';
export type { WebSecurityOptions } from './headers.js';
