/**
 * Embed proxy — origin checking (Phase 11).
 *
 * Checks whether an incoming request Origin header is allowed by the
 * embed policy's allowedOrigins list.
 *
 * Matching rules:
 *  - Exact match: origin host === policy host (e.g. "https://app.example.com")
 *  - Subdomain match: policy allows "example.com" → "app.example.com" is allowed
 *  - Evil-example.com NOT allowed when policy allows example.com
 *  - Empty origin (non-browser) → denied unless policy explicitly allows ''
 *
 * Public surface:
 *  - {@link isAllowedOrigin} — returns true if the origin is permitted
 */

import type { EmbedPolicy } from './policies.js';

/**
 * Extract the hostname from an origin string.
 * "https://app.example.com" → "app.example.com"
 * "" → ""
 */
function parseOrigin(origin: string): { hostname: string; scheme: string; port: string } {
  if (!origin) return { hostname: '', scheme: '', port: '' };
  try {
    const url = new URL(origin);
    return { hostname: url.hostname, scheme: url.protocol, port: url.port };
  } catch {
    // Not a valid URL — treat as bare hostname
    return {
      hostname: origin.replace(/^https?:\/\//, '').split('/')[0] as string,
      scheme: '',
      port: '',
    };
  }
}

/**
 * Check if `requestHostname` is a subdomain of (or equal to) `policyHostname`.
 *
 * Matches:
 *  - "app.example.com" is subdomain of "example.com" ✓
 *  - "example.com" equals "example.com" ✓
 *  - "evil-example.com" is NOT subdomain of "example.com" ✗
 *
 * This works by checking that the request hostname either:
 *  1. Equals the policy hostname exactly, OR
 *  2. Ends with "." + policy hostname (i.e. is a proper subdomain)
 */
function isSubdomainOrEqual(requestHostname: string, policyHostname: string): boolean {
  const lowerReq = requestHostname.toLowerCase();
  const lowerPol = policyHostname.toLowerCase();
  return lowerReq === lowerPol || lowerReq.endsWith('.' + lowerPol);
}

/**
 * Check if the given origin is allowed by the embed policy.
 *
 * @param policy - The embed policy with allowedOrigins
 * @param origin - The request's Origin header value (may be undefined)
 * @returns true if the origin is permitted
 */
export function isAllowedOrigin(policy: EmbedPolicy, origin: string | undefined): boolean {
  const allowedOrigins = policy.allowedOrigins;

  // Empty allowlist → deny all
  if (allowedOrigins.length === 0) return false;

  // No origin header (non-browser request) → check for explicit '' allowance
  if (!origin || origin === 'null') {
    return allowedOrigins.includes('');
  }

  const req = parseOrigin(origin);

  for (const allowed of allowedOrigins) {
    // Explicit empty string allowance (for non-browser requests)
    if (allowed === '') continue; // skip — non-browser origins handled above

    const alw = parseOrigin(allowed);

    // Scheme must match (if the allowed origin specifies one)
    if (alw.scheme && req.scheme && alw.scheme !== req.scheme) continue;

    // Port must match — deny non-standard ports when policy specifies none
    if (!alw.port && req.port) continue; // policy has no port, request has non-standard port
    if (alw.port && req.port !== alw.port) continue; // policy has port, must match

    // Subdomain or exact hostname match
    if (isSubdomainOrEqual(req.hostname, alw.hostname)) {
      return true;
    }
  }

  return false;
}
