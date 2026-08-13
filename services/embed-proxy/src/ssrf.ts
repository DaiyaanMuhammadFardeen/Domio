/**
 * Embed proxy — SSRF guard (Phase 08).
 *
 * Validates outbound URLs to prevent Server-Side Request Forgery.
 * Blocks loopback, link-local, RFC1918, metadata endpoints, and
 * non-HTTP(S) schemes.  Hostname resolution is checked against
 * blocked ranges.
 *
 * Public surface:
 *  - {@link isUrlSafe} — returns true if the URL is safe to fetch.
 *  - {@link isHostnameBlocked} — checks a hostname against blocked ranges.
 *  - {@link SsrfBlockedError} — thrown when a URL is rejected.
 */

import { isIPv4 } from 'node:net';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class SsrfBlockedError extends Error {
  readonly code = 'SSRF_BLOCKED' as const;
  constructor(
    public readonly url: string,
    public readonly reason: string,
  ) {
    super(`SSRF blocked: ${url} — ${reason}`);
    this.name = 'SsrfBlockedError';
  }
}

// ---------------------------------------------------------------------------
// Blocked hostname / IP ranges
// ---------------------------------------------------------------------------

/** RFC 1918 + loopback + link-local + metadata. */
const BLOCKED_IPV4_PREFIXES: Array<{ prefix: string; bits: number; label: string }> = [
  { prefix: '127.0.0.0', bits: 8, label: 'loopback' }, // 127.0.0.0/8
  { prefix: '10.0.0.0', bits: 8, label: 'RFC1918' }, // 10.0.0.0/8
  { prefix: '172.16.0.0', bits: 12, label: 'RFC1918' }, // 172.16.0.0/12
  { prefix: '192.168.0.0', bits: 16, label: 'RFC1918' }, // 192.168.0.0/16
  { prefix: '169.254.0.0', bits: 16, label: 'link-local' }, // 169.254.0.0/16
  { prefix: '0.0.0.0', bits: 8, label: 'unspecified' }, // 0.0.0.0/8
];

/** Cloud metadata endpoints. */
const BLOCKED_HOSTNAMES = new Set([
  '169.254.169.254', // AWS / GCP / Azure metadata
  'metadata.google.internal', // GCP metadata
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ipv4ToInt(addr: string): number {
  const parts = addr.split('.');
  if (parts.length !== 4) return -1;
  let result = 0;
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 255) return -1;
    result = (result << 8) | n;
  }
  return result >>> 0;
}

function prefixToMask(bits: number): number {
  return bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
}

/**
 * Check if a resolved IPv4 address falls within a blocked prefix.
 * Returns the label of the matching range, or null if safe.
 */
export function checkIpv4Blocked(ip: string): string | null {
  const addr = ipv4ToInt(ip);
  if (addr < 0) return null;
  for (const { prefix, bits, label } of BLOCKED_IPV4_PREFIXES) {
    const prefixInt = ipv4ToInt(prefix);
    const mask = prefixToMask(bits);
    if ((addr & mask) === (prefixInt & mask)) return label;
  }
  return null;
}

/**
 * Check if a hostname is in the blocked set.
 * Returns the reason string, or null if safe.
 */
export function isHostnameBlocked(hostname: string): string | null {
  const lower = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(lower)) return `blocked hostname: ${lower}`;
  // Pure IPv4 literal
  if (isIPv4(lower)) {
    const blocked = checkIpv4Blocked(lower);
    if (blocked) return `blocked IPv4 range: ${blocked}`;
    return null;
  }
  // IPv6 loopback / unspecified
  if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return 'blocked IPv6 loopback';
  if (lower === '::' || lower === '0:0:0:0:0:0:0:0') return 'blocked IPv6 unspecified';
  // IPv6 link-local (fe80::/10)
  if (lower.startsWith('fe80:') || lower.startsWith('fe90:')) return 'blocked IPv6 link-local';
  // IPv6 private (fc00::/7)
  if (lower.startsWith('fc') || lower.startsWith('fd')) return 'blocked IPv6 ULA';
  return null;
}

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------

const ALLOWED_SCHEMES = new Set(['https:']);

/**
 * Validate a URL for safe fetching.
 *
 * Rules:
 *  1. Only `https:` scheme is allowed (http: rejected, everything else rejected).
 *  2. Hostname must not be in the blocked set.
 *  3. Resolved IP must not fall in a blocked range (if resolveFn provided).
 */
export async function isUrlSafe(
  urlString: string,
  resolveFn?: (hostname: string) => Promise<string[]>,
): Promise<{ safe: boolean; reason: string }> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { safe: false, reason: 'invalid URL' };
  }

  if (!ALLOWED_SCHEMES.has(url.protocol)) {
    return { safe: false, reason: `scheme not allowed: ${url.protocol}` };
  }

  const hostname = url.hostname;
  const hostnameBlockReason = isHostnameBlocked(hostname);
  if (hostnameBlockReason) return { safe: false, reason: hostnameBlockReason };

  if (resolveFn) {
    try {
      const addrs = await resolveFn(hostname);
      for (const addr of addrs) {
        const blocked = checkIpv4Blocked(addr);
        if (blocked) return { safe: false, reason: `resolved to blocked IPv4 range: ${blocked}` };
        // IPv6 checks
        if (addr === '::1') return { safe: false, reason: 'resolved to IPv6 loopback' };
        if (addr.startsWith('fe80:') || addr.startsWith('fe90:'))
          return { safe: false, reason: 'resolved to IPv6 link-local' };
        if (addr.startsWith('fc') || addr.startsWith('fd'))
          return { safe: false, reason: 'resolved to IPv6 ULA' };
      }
    } catch {
      return { safe: false, reason: 'DNS resolution failed' };
    }
  }

  return { safe: true, reason: '' };
}

/**
 * Convenience wrapper that throws {@link SsrfBlockedError} instead of
 * returning a result tuple.
 */
export async function assertUrlSafe(
  urlString: string,
  resolveFn?: (hostname: string) => Promise<string[]>,
): Promise<void> {
  const result = await isUrlSafe(urlString, resolveFn);
  if (!result.safe) throw new SsrfBlockedError(urlString, result.reason);
}
