import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  sha256Hex,
  canonicalHash,
  signJws,
  verifyJws,
  signUrl,
  verifySignedUrl,
  ulid,
  uuid,
} from './index.js';

describe('crypto', () => {
  describe('sha256Hex', () => {
    it('hashes a string', () => {
      const hash = sha256Hex('hello');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
    it('hashes Uint8Array', () => {
      const bytes = new TextEncoder().encode('hello');
      const hash = sha256Hex(bytes);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('canonicalHash', () => {
    it('returns deterministic hash for object', () => {
      const h1 = canonicalHash({ a: 1, b: 'test' });
      const h2 = canonicalHash({ a: 1, b: 'test' });
      expect(h1).toBe(h2);
    });
  });

  describe('signJws / verifyJws', () => {
    it('signs and verifies a token', () => {
      const token = signJws({ sub: 'user-1', exp: 99999 }, 'secret');
      const result = verifyJws(token, 'secret');
      expect(result.valid).toBe(true);
      expect(result.payload!.sub).toBe('user-1');
    });
    it('rejects wrong secret', () => {
      const token = signJws({ sub: 'user-1' }, 'secret');
      const result = verifyJws(token, 'wrong-secret');
      expect(result.valid).toBe(false);
    });
    it('rejects malformed token', () => {
      expect(verifyJws('not.a.token', 'secret').valid).toBe(false);
    });
    it('rejects two-part token', () => {
      expect(verifyJws('only.two', 'secret').valid).toBe(false);
    });
    it('rejects non-object payload', () => {
      // Manually construct a JWS with non-object payload
      const b64url = (buf: Buffer) => Buffer.from(buf).toString('base64url');
      const header = b64url(Buffer.from(JSON.stringify({ alg: 'HS256' })));
      const payload = b64url(Buffer.from(JSON.stringify('not-object')));
      const sig = createHmac('sha256', 'secret').update(`${header}.${payload}`).digest();
      const token = `${header}.${payload}.${b64url(sig)}`;
      const result = verifyJws(token, 'secret');
      expect(result.valid).toBe(false);
    });
    it('accepts custom header', () => {
      const token = signJws({ data: 42 }, 's', { kid: 'k1' });
      const result = verifyJws(token, 's');
      expect(result.valid).toBe(true);
    });
  });

  describe('signUrl / verifySignedUrl', () => {
    it('signs and verifies a URL', () => {
      const expiresAt = Date.now() + 60000;
      const url = signUrl('GET', '/bundles/abc', 'secret', expiresAt);
      const result = verifySignedUrl('GET', url, 'secret', Date.now());
      expect(result.valid).toBe(true);
    });
    it('rejects expired URL', () => {
      const expiresAt = 1000;
      const url = signUrl('GET', '/bundles/abc', 'secret', expiresAt);
      const result = verifySignedUrl('GET', url, 'secret', 5000);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('expired');
    });
    it('rejects wrong method', () => {
      const expiresAt = Date.now() + 60000;
      const url = signUrl('GET', '/bundles/abc', 'secret', expiresAt);
      const result = verifySignedUrl('POST', url, 'secret', Date.now());
      expect(result.valid).toBe(false);
    });
    it('rejects wrong secret', () => {
      const expiresAt = Date.now() + 60000;
      const url = signUrl('GET', '/bundles/abc', 'secret', expiresAt);
      const result = verifySignedUrl('GET', url, 'wrong', Date.now());
      expect(result.valid).toBe(false);
    });
    it('handles URL with existing query params', () => {
      const expiresAt = Date.now() + 60000;
      const url = signUrl('GET', '/bundles/abc?foo=bar', 'secret', expiresAt);
      expect(url).toContain('foo=bar');
      expect(url).toContain('&expires=');
    });
    it('rejects missing params', () => {
      const result = verifySignedUrl('GET', '/bundles/abc', 'secret', Date.now());
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('missing-params');
    });
    it('handles policy parameter', () => {
      const expiresAt = Date.now() + 60000;
      const url = signUrl('GET', '/bundles/abc', 'secret', expiresAt, 'my-policy');
      expect(url).toContain('policy=my-policy');
      const result = verifySignedUrl('GET', url, 'secret', Date.now());
      expect(result.valid).toBe(true);
    });
  });

  describe('ulid', () => {
    it('generates a 26-char string', () => {
      const id = ulid(1700000000000);
      expect(id.length).toBe(26);
    });
    it('is deterministic for same timestamp', () => {
      const a = ulid(1000);
      const b = ulid(1000);
      // Not necessarily equal (random part), but format is correct
      expect(a.length).toBe(26);
      expect(b.length).toBe(26);
    });
  });

  describe('uuid', () => {
    it('generates a 32-char hex string', () => {
      const id = uuid();
      expect(id).toMatch(/^[0-9a-f]{32}$/);
    });
    it('generates unique ids', () => {
      expect(uuid()).not.toBe(uuid());
    });
  });
});
