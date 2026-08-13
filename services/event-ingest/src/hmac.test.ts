/**
 * Tests for HMAC verification (Phase 17 W1).
 */
import { describe, expect, it } from 'vitest';
import { buildHmacVerifier, HMAC_HEADER_NAME, HMAC_SCHEME, SignatureError } from './hmac.js';

const KEY = '00112233445566778899aabbccddeeff';

describe('hmac', () => {
  it('round-trips a valid signature', () => {
    const verifier = buildHmacVerifier(KEY);
    const ts = 1_700_000_000_000;
    const nonce = 'abcdef0123456789';
    const body = '{"hello":"world"}';
    const sig = verifier.sign(body, ts, nonce);
    expect(sig.startsWith(HMAC_SCHEME)).toBe(true);
    const verified = verifier.verify({
      rawBody: body,
      signatureHeader: sig,
      timestampHeader: String(ts),
      nonceHeader: nonce,
      maxClockSkewMs: 60_000,
      now: ts + 1000,
    });
    expect(verified.timestamp).toBe(ts);
    expect(verified.nonce).toBe(nonce);
  });

  it('rejects missing headers', () => {
    const verifier = buildHmacVerifier(KEY);
    expect(() =>
      verifier.verify({
        rawBody: '{}',
        signatureHeader: null,
        timestampHeader: null,
        nonceHeader: null,
        maxClockSkewMs: 60_000,
        now: 0,
      }),
    ).toThrow(SignatureError);
  });

  it('rejects signature scheme that is not sha256=', () => {
    const verifier = buildHmacVerifier(KEY);
    const ts = 1_700_000_000_000;
    expect(() =>
      verifier.verify({
        rawBody: '{}',
        signatureHeader: 'md5=deadbeef',
        timestampHeader: String(ts),
        nonceHeader: 'nonce1234',
        maxClockSkewMs: 60_000,
        now: ts,
      }),
    ).toThrow(SignatureError);
  });

  it('rejects when clock skew exceeds limit', () => {
    const verifier = buildHmacVerifier(KEY);
    const ts = 1_700_000_000_000;
    const body = '{}';
    const sig = verifier.sign(body, ts, 'nonce1234');
    expect(() =>
      verifier.verify({
        rawBody: body,
        signatureHeader: sig,
        timestampHeader: String(ts),
        nonceHeader: 'nonce1234',
        maxClockSkewMs: 1000,
        now: ts + 60_000,
      }),
    ).toThrow(/clock skew/);
  });

  it('rejects when nonce is too short', () => {
    const verifier = buildHmacVerifier(KEY);
    const ts = 1_700_000_000_000;
    expect(() =>
      verifier.verify({
        rawBody: '{}',
        signatureHeader: `${HMAC_SCHEME}00`,
        timestampHeader: String(ts),
        nonceHeader: 'short',
        maxClockSkewMs: 60_000,
        now: ts,
      }),
    ).toThrow(SignatureError);
  });

  it('rejects mismatched body', () => {
    const verifier = buildHmacVerifier(KEY);
    const ts = 1_700_000_000_000;
    const sig = verifier.sign('{"a":1}', ts, 'nonce1234');
    expect(() =>
      verifier.verify({
        rawBody: '{"a":2}',
        signatureHeader: sig,
        timestampHeader: String(ts),
        nonceHeader: 'nonce1234',
        maxClockSkewMs: 60_000,
        now: ts,
      }),
    ).toThrow(SignatureError);
  });

  it('exports the canonical header name', () => {
    expect(HMAC_HEADER_NAME).toBe('X-Domio-Signature');
  });
});
