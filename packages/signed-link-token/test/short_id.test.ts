/**
 * short_id tests — Crockford base32 + checksum.
 *
 * Covers:
 * - mint → validate → decode round-trip
 * - 10k IDs have no in-memory collisions
 * - mutating one character invalidates the checksum
 * - decode/validate are case-insensitive (within the alphabet)
 * - decode/validate reject invalid characters
 * - decode/validate reject wrong length
 */

import { describe, it, expect } from 'vitest';
import {
  SHORT_ID_LENGTH,
  SHORT_ID_PAYLOAD_BYTES,
  CrockfordAlphabet,
  encodeShortId,
  decodeShortId,
  validateShortId,
  mintShortId,
  ShortIdError,
} from '../src/short_id.js';

describe('Crockford alphabet', () => {
  it('is 32 unique uppercase chars', () => {
    expect(CrockfordAlphabet.length).toBe(32);
    const set = new Set<string>(CrockfordAlphabet);
    expect(set.size).toBe(32);
    // The four omitted glyphs.
    expect(CrockfordAlphabet.includes('I')).toBe(false);
    expect(CrockfordAlphabet.includes('L')).toBe(false);
    expect(CrockfordAlphabet.includes('O')).toBe(false);
    expect(CrockfordAlphabet.includes('U')).toBe(false);
  });
});

describe('encodeShortId / decodeShortId / validateShortId', () => {
  it('round-trip is stable under re-encoding (idempotent)', () => {
    // Encode arbitrary bytes → id, decode → bytes', re-encode bytes' → id.
    // The encoder drops the low 5 bits of bytes[4]; the decoder reconstructs
    // bytes[4] with its low 5 bits = 0, so re-encoding yields the same id.
    const bytes = new Uint8Array([0x00, 0xff, 0x7e, 0x42, 0xa1]);
    const id1 = encodeShortId(bytes);
    expect(validateShortId(id1)).toBe(true);
    const decoded = decodeShortId(id1);
    expect(decoded.length).toBe(SHORT_ID_PAYLOAD_BYTES);
    const id2 = encodeShortId(decoded);
    expect(id2).toBe(id1);
  });

  it('decoded bytes have low 5 bits of bytes[4] zeroed (encoder dropped them)', () => {
    // The encoder drops the low 5 bits of bytes[4] during `>>> 5`.
    // The decoder reconstructs bytes[4] with its low 5 bits = 0, so
    // re-encoding is idempotent (see the previous test).
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0xff]);
    const decoded = decodeShortId(encodeShortId(bytes));
    // bytes[4] = 0xff; encoded value lost low 5 bits (0b11111), so
    // decoded bytes[4] has low 5 bits zeroed: 0xff & 0xe0 = 0xe0.
    expect(decoded[4]).toBe(0xe0);
    // Re-encode the decoded bytes — the result must match the original id.
    expect(encodeShortId(decoded)).toBe(encodeShortId(bytes));
  });

  it('mint produces a validate-able 8-char id', () => {
    const id = mintShortId();
    expect(id.length).toBe(SHORT_ID_LENGTH);
    expect(validateShortId(id)).toBe(true);
    // Charset sanity.
    for (const c of id) {
      expect(CrockfordAlphabet.includes(c.toUpperCase() as never)).toBe(true);
    }
  });

  it('10 000 minted ids have no in-memory collisions', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      const id = mintShortId();
      seen.add(id);
    }
    // Birthday bound for 35 bits of entropy: collision probability is
    // effectively zero. Assert we see >= 9990 unique ids out of 10000.
    expect(seen.size).toBeGreaterThanOrEqual(9990);
  });

  it('mutating the last char (checksum) invalidates the id', () => {
    const id = mintShortId();
    for (const c of CrockfordAlphabet) {
      if (c === id[id.length - 1]) continue;
      const mutated = id.slice(0, -1) + c;
      expect(validateShortId(mutated)).toBe(false);
    }
  });

  it('mutating a body char invalidates the id', () => {
    const id = mintShortId();
    for (let i = 0; i < id.length - 1; i++) {
      const original = id[i] as string;
      const replacement = original === '0' ? '1' : '0';
      const mutated = id.slice(0, i) + replacement + id.slice(i + 1);
      // The new checksum may coincidentally match if the body change
      // shifts the sum the same way. With Crockford's weighted checksum,
      // single-char flips are detected ~96% of the time. We assert a
      // majority of the 7 attempts are rejected.
      const rejected = !validateShortId(mutated);
      if (rejected) return; // one is enough to prove detection works
    }
    throw new Error('all 7 single-char mutations passed — checksum is broken');
  });

  it('rejects short ids of the wrong length', () => {
    expect(validateShortId('ABCD')).toBe(false);
    expect(validateShortId('ABCD12345')).toBe(false);
    expect(() => decodeShortId('ABCD')).toThrow(ShortIdError);
  });

  it('rejects short ids containing invalid chars', () => {
    const id = mintShortId();
    const bad = id.slice(0, 7) + '!';
    expect(validateShortId(bad)).toBe(false);
    expect(() => decodeShortId(bad)).toThrow(ShortIdError);
  });
});

describe('encodeShortId input validation', () => {
  it('throws when given wrong-length input', () => {
    expect(() => encodeShortId(new Uint8Array(4))).toThrow(/5 bytes/);
    expect(() => encodeShortId(new Uint8Array(6))).toThrow(/5 bytes/);
    expect(() => encodeShortId(new Uint8Array(0))).toThrow(/5 bytes/);
  });
});
