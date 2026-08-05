/**
 * Embed proxy — Content-Security-Policy header builder (Phase 11).
 *
 * Builds the `frame-ancestors` directive from the embed policy's
 * allowed origins for the CSP header.
 *
 * Public surface:
 *  - {@link buildCspHeader} — returns the CSP header value
 *  - {@link buildFocusTrapHeader} — returns the Focus-Trap header value
 */

import type { EmbedPolicy } from './policies.js';

/**
 * Build the Content-Security-Policy header value for frame-ancestors.
 *
 * - Empty allowedOrigins → `frame-ancestors 'none'`
 * - Otherwise → `frame-ancestors 'self' <origin1> <origin2> ...`
 *
 * @param policy - The embed policy
 * @returns The CSP header value string
 */
export function buildCspHeader(policy: EmbedPolicy): string {
  const origins = policy.allowedOrigins.filter((o) => o !== '');

  if (origins.length === 0) {
    return "frame-ancestors 'none'";
  }

  return `frame-ancestors 'self' ${origins.join(' ')}`;
}

/**
 * Build the Focus-Trap header value.
 *
 * @param policy - The embed policy
 * @returns 'enabled' if trapFocus is true, undefined otherwise
 */
export function buildFocusTrapHeader(policy: EmbedPolicy): string | undefined {
  return policy.trapFocus ? 'enabled' : undefined;
}
