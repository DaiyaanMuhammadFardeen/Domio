/**
 * Export pipeline — SSRF guard (Phase 09).
 *
 * Blocks requests to loopback, RFC1918, link-local, metadata endpoints,
 * IPv6 loopback, and non-HTTPS URLs.  Allows public HTTPS hosts.
 */

import { isIPv6 } from 'node:net';
import { URL } from 'node:url';

export class SsrfBlockError extends Error {
  readonly code = 'SSRF_BLOCKED' as const;
  constructor(
    public readonly reason: string,
    public readonly url: string,
  ) {
    super(`SSRF blocked: ${reason} — ${url}`);
    this.name = 'SsrfBlockError';
  }
}

/**
 * Validate that a URL is safe to fetch (no SSRF).
 * Throws SsrfBlockError if the URL is blocked.
 */
export function validateUrl(urlString: string): void {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new SsrfBlockError('invalid URL', urlString);
  }

  // Must be HTTPS
  if (url.protocol !== 'https:') {
    throw new SsrfBlockError('non-HTTPS protocol', urlString);
  }

  const hostname = url.hostname.toLowerCase();

  // IPv6 loopback
  if (isIPv6(hostname) || hostname.startsWith('[')) {
    const raw = hostname.replace(/^\[|\]$/g, '');
    if (raw === '::1' || raw === '0:0:0:0:0:0:0:1') {
      throw new SsrfBlockError('IPv6 loopback', urlString);
    }
  }

  // IPv4 loopback
  if (
    hostname === '127.0.0.0' ||
    hostname === '127.0.0.1' ||
    hostname === '127.255.255.255' ||
    hostname.startsWith('127.')
  ) {
    throw new SsrfBlockError('IPv4 loopback', urlString);
  }

  // RFC1918 private ranges
  if (isPrivateIp(hostname)) {
    throw new SsrfBlockError('RFC1918 private address', urlString);
  }

  // Link-local (169.254.x.x)
  if (hostname.startsWith('169.254.')) {
    throw new SsrfBlockError('link-local address', urlString);
  }

  // Cloud metadata endpoints
  if (
    hostname === '169.254.169.254' ||
    hostname === 'metadata.google.internal' ||
    hostname === 'metadata.azure.com'
  ) {
    throw new SsrfBlockError('cloud metadata endpoint', urlString);
  }

  // Localhost variants
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new SsrfBlockError('localhost', urlString);
  }
}

function isPrivateIp(hostname: string): boolean {
  // 10.0.0.0/8
  if (hostname.startsWith('10.')) return true;
  // 172.16.0.0/12
  if (hostname.startsWith('172.')) {
    const second = parseInt(hostname.split('.')[1] ?? '0', 10);
    if (second >= 16 && second <= 31) return true;
  }
  // 192.168.0.0/16
  if (hostname.startsWith('192.168.')) return true;
  return false;
}
