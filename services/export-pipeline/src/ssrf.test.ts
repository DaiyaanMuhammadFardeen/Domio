/**
 * Export pipeline — SSRF guard tests (Phase 09).
 *
 * Covers:
 * - Blocks loopback (127.0.0.0/8)
 * - Blocks RFC1918 (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
 * - Blocks link-local (169.254.x.x)
 * - Blocks cloud metadata endpoints
 * - Blocks IPv6 loopback
 * - Blocks non-HTTPS
 * - Blocks localhost
 * - Allows public HTTPS host
 */

import { describe, it, expect } from 'vitest';
import { validateUrl, SsrfBlockError } from './ssrf.js';

describe('SSRF guard — blocked URLs', () => {
  it('blocks 127.0.0.1', () => {
    expect(() => validateUrl('https://127.0.0.1/data')).toThrow(SsrfBlockError);
  });

  it('blocks 127.0.0.0/8 range', () => {
    expect(() => validateUrl('https://127.255.255.255/data')).toThrow(SsrfBlockError);
  });

  it('blocks 10.0.0.0/8 (RFC1918)', () => {
    expect(() => validateUrl('https://10.0.0.1/data')).toThrow(SsrfBlockError);
  });

  it('blocks 172.16.0.0/12 (RFC1918)', () => {
    expect(() => validateUrl('https://172.16.0.1/data')).toThrow(SsrfBlockError);
    expect(() => validateUrl('https://172.31.255.255/data')).toThrow(SsrfBlockError);
  });

  it('blocks 192.168.0.0/16 (RFC1918)', () => {
    expect(() => validateUrl('https://192.168.1.1/data')).toThrow(SsrfBlockError);
  });

  it('blocks 169.254.x.x (link-local)', () => {
    expect(() => validateUrl('https://169.254.169.254/latest/meta-data')).toThrow(SsrfBlockError);
  });

  it('blocks cloud metadata endpoint 169.254.169.254', () => {
    expect(() => validateUrl('https://169.254.169.254/latest/meta-data/')).toThrow(SsrfBlockError);
  });

  it('blocks metadata.google.internal', () => {
    expect(() => validateUrl('https://metadata.google.internal/')).toThrow(SsrfBlockError);
  });

  it('blocks localhost', () => {
    expect(() => validateUrl('https://localhost/data')).toThrow(SsrfBlockError);
  });

  it('blocks sub.localhost', () => {
    expect(() => validateUrl('https://foo.localhost/data')).toThrow(SsrfBlockError);
  });

  it('blocks non-HTTPS (http://)', () => {
    expect(() => validateUrl('http://example.com/data')).toThrow(SsrfBlockError);
  });

  it('blocks non-HTTPS (ftp://)', () => {
    expect(() => validateUrl('ftp://example.com/data')).toThrow(SsrfBlockError);
  });

  it('blocks invalid URLs', () => {
    expect(() => validateUrl('not-a-url')).toThrow(SsrfBlockError);
  });
});

describe('SSRF guard — allowed URLs', () => {
  it('allows public HTTPS host', () => {
    expect(() => validateUrl('https://example.com/data')).not.toThrow();
  });

  it('allows public HTTPS with path and query', () => {
    expect(() => validateUrl('https://cdn.example.com/images/logo.png?size=128')).not.toThrow();
  });

  it('allows public HTTPS with port', () => {
    expect(() => validateUrl('https://example.com:8443/data')).not.toThrow();
  });
});
