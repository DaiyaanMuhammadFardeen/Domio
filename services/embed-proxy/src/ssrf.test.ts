/**
 * SSRF guard tests — covers loopback, link-local, RFC1918, metadata,
 * non-http schemes, hostname resolution, and public HTTPS passthrough.
 */

import { describe, it, expect } from 'vitest';
import { isUrlSafe, isHostnameBlocked, checkIpv4Blocked, SsrfBlockedError } from './ssrf.js';

describe('ssrf — isHostnameBlocked', () => {
  it('blocks localhost', () => {
    expect(isHostnameBlocked('localhost')).toBe('blocked hostname: localhost');
  });

  it('blocks AWS/GCP/Azure metadata IP', () => {
    expect(isHostnameBlocked('169.254.169.254')).toBe('blocked hostname: 169.254.169.254');
  });

  it('blocks GCP metadata hostname', () => {
    expect(isHostnameBlocked('metadata.google.internal')).toBe(
      'blocked hostname: metadata.google.internal',
    );
  });

  it('blocks IPv6 loopback', () => {
    expect(isHostnameBlocked('::1')).toBe('blocked IPv6 loopback');
  });

  it('blocks IPv6 unspecified', () => {
    expect(isHostnameBlocked('::')).toBe('blocked IPv6 unspecified');
  });

  it('blocks IPv6 link-local', () => {
    expect(isHostnameBlocked('fe80::1')).toBe('blocked IPv6 link-local');
  });

  it('blocks IPv6 ULA', () => {
    expect(isHostnameBlocked('fd00::1')).toBe('blocked IPv6 ULA');
  });

  it('allows public hostnames', () => {
    expect(isHostnameBlocked('example.com')).toBeNull();
    expect(isHostnameBlocked('api.stripe.com')).toBeNull();
  });
});

describe('ssrf — checkIpv4Blocked', () => {
  it('blocks loopback 127.x', () => {
    expect(checkIpv4Blocked('127.0.0.1')).toBe('loopback');
    expect(checkIpv4Blocked('127.255.255.255')).toBe('loopback');
  });

  it('blocks RFC1918 10.x', () => {
    expect(checkIpv4Blocked('10.0.0.1')).toBe('RFC1918');
    expect(checkIpv4Blocked('10.255.255.255')).toBe('RFC1918');
  });

  it('blocks RFC1918 172.16-31.x', () => {
    expect(checkIpv4Blocked('172.16.0.1')).toBe('RFC1918');
    expect(checkIpv4Blocked('172.31.255.255')).toBe('RFC1918');
    expect(checkIpv4Blocked('172.15.0.1')).toBeNull();
    expect(checkIpv4Blocked('172.32.0.1')).toBeNull();
  });

  it('blocks RFC1918 192.168.x', () => {
    expect(checkIpv4Blocked('192.168.0.1')).toBe('RFC1918');
    expect(checkIpv4Blocked('192.168.255.255')).toBe('RFC1918');
  });

  it('blocks link-local 169.254.x', () => {
    expect(checkIpv4Blocked('169.254.0.1')).toBe('link-local');
    expect(checkIpv4Blocked('169.254.255.255')).toBe('link-local');
  });

  it('blocks 0.0.0.0', () => {
    expect(checkIpv4Blocked('0.0.0.0')).toBe('unspecified');
  });

  it('allows public IPs', () => {
    expect(checkIpv4Blocked('8.8.8.8')).toBeNull();
    expect(checkIpv4Blocked('1.1.1.1')).toBeNull();
    expect(checkIpv4Blocked('203.0.113.1')).toBeNull();
  });
});

describe('ssrf — isUrlSafe', () => {
  it('allows public HTTPS URLs', async () => {
    const result = await isUrlSafe('https://api.example.com/data');
    expect(result.safe).toBe(true);
  });

  it('rejects HTTP scheme', async () => {
    const result = await isUrlSafe('http://api.example.com/data');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('scheme not allowed');
  });

  it('rejects file: scheme', async () => {
    const result = await isUrlSafe('file:///etc/passwd');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('scheme not allowed');
  });

  it('rejects javascript: scheme', async () => {
    const result = await isUrlSafe('javascript:alert(1)');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('scheme not allowed');
  });

  it('rejects ftp: scheme', async () => {
    const result = await isUrlSafe('ftp://example.com/file');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('scheme not allowed');
  });

  it('rejects localhost hostname', async () => {
    const result = await isUrlSafe('https://localhost/admin');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('blocked hostname');
  });

  it('rejects metadata hostname', async () => {
    const result = await isUrlSafe('https://169.254.169.254/latest/meta-data');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('blocked hostname');
  });

  it('rejects invalid URLs', async () => {
    const result = await isUrlSafe('not-a-url');
    expect(result.safe).toBe(false);
    expect(result.reason).toBe('invalid URL');
  });

  it('rejects URLs with blocked resolved IPs via resolveFn', async () => {
    const resolveFn = async () => ['127.0.0.1'];
    const result = await isUrlSafe('https://internal-service.local/data', resolveFn);
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('resolved to blocked IPv4 range');
  });

  it('rejects IPv6 loopback resolution', async () => {
    const resolveFn = async () => ['::1'];
    const result = await isUrlSafe('https://some-host.example.com', resolveFn);
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('IPv6 loopback');
  });

  it('rejects IPv6 link-local resolution', async () => {
    const resolveFn = async () => ['fe80::1'];
    const result = await isUrlSafe('https://some-host.example.com', resolveFn);
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('link-local');
  });

  it('allows public IP resolution', async () => {
    const resolveFn = async () => ['8.8.8.8'];
    const result = await isUrlSafe('https://example.com', resolveFn);
    expect(result.safe).toBe(true);
  });

  it('handles DNS failure gracefully', async () => {
    const resolveFn = async () => {
      throw new Error('ENOTFOUND');
    };
    const result = await isUrlSafe('https://nonexistent.example.com', resolveFn);
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('DNS resolution failed');
  });
});

describe('ssrf — SsrfBlockedError', () => {
  it('has correct code and message', () => {
    const err = new SsrfBlockedError('http://evil.com', 'blocked');
    expect(err.code).toBe('SSRF_BLOCKED');
    expect(err.message).toContain('http://evil.com');
    expect(err.message).toContain('blocked');
    expect(err.name).toBe('SsrfBlockedError');
  });
});
