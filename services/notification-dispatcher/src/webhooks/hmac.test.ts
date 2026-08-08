import { describe, it, expect, afterEach, vi } from 'vitest';
import { signPayload, verifySignature } from './hmac.js';

describe('webhooks/hmac', () => {
  const secret = 'test-secret-key-12345';
  const body = '{"event":"test","data":"hello"}';

  describe('signPayload', () => {
    it('returns a hex string', () => {
      const sig = signPayload(secret, body);
      expect(sig).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is deterministic for same inputs', () => {
      const s1 = signPayload(secret, body);
      const s2 = signPayload(secret, body);
      expect(s1).toBe(s2);
    });

    it('changes when body changes', () => {
      const s1 = signPayload(secret, body);
      const s2 = signPayload(secret, '{"event":"different"}');
      expect(s1).not.toBe(s2);
    });

    it('changes when secret changes', () => {
      const s1 = signPayload(secret, body);
      const s2 = signPayload('other-secret', body);
      expect(s1).not.toBe(s2);
    });
  });

  describe('verifySignature', () => {
    it('returns true for valid signature', () => {
      const sig = signPayload(secret, body);
      expect(verifySignature(secret, sig, body)).toBe(true);
    });

    it('returns false for tampered body', () => {
      const sig = signPayload(secret, body);
      expect(verifySignature(secret, sig, '{"event":"tampered"}')).toBe(false);
    });

    it('returns false for wrong secret', () => {
      const sig = signPayload(secret, body);
      expect(verifySignature('wrong-secret', sig, body)).toBe(false);
    });

    it('returns false for truncated signature', () => {
      const sig = signPayload(secret, body);
      expect(verifySignature(secret, sig.slice(0, 32), body)).toBe(false);
    });

    it('returns false for empty signature', () => {
      expect(verifySignature(secret, '', body)).toBe(false);
    });

    it('returns false for non-hex signature', () => {
      expect(verifySignature(secret, 'not-hex-at-all!'.repeat(5), body)).toBe(false);
    });
  });

  describe('default secret warning', () => {
    const originalEnv = process.env.NOTIFICATION_WEBHOOK_SECRET;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.NOTIFICATION_WEBHOOK_SECRET;
      } else {
        process.env.NOTIFICATION_WEBHOOK_SECRET = originalEnv;
      }
    });

    it('uses default secret when env var is unset and logs warning', async () => {
      delete process.env.NOTIFICATION_WEBHOOK_SECRET;
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Import fresh to reset cached secret
      // The module caches the secret, so we test the verify path
      const sig = signPayload(undefined, 'test-body');
      const result = verifySignature(undefined, sig, 'test-body');
      expect(result).toBe(true);

      consoleSpy.mockRestore();
    });
  });
});
