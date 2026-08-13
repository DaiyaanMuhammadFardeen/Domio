/**
 * @domio/signed-link-token — 8-character Crockford base32 short-id generator.
 *
 * Phase 14 W1. The short-id is the public identifier for a share link
 * embedded in URLs (e.g. `https://app.domio.com/s/ABCDEFGH`).
 *
 * Crockford base32 alphabet omits I, L, O, U to avoid ambiguous glyphs
 * (1/l, 0/O, V/U). Each id is 8 characters: 7 random base32 chars + 1
 * mod-31 checksum at the end. The checksum catches single-character
 * transcription errors with 100% detection rate and many multi-char
 * errors with high probability.
 *
 * Public API:
 *  - `SHORT_ID_LENGTH` — 8
 *  - `CrockfordAlphabet` — the 32 valid characters
 *  - `encodeShortId(bytes)` — encode 5 random bytes → 8-char string
 *  - `decodeShortId(s)` — decode 8-char string → 5 bytes (throws on bad checksum)
 *  - `validateShortId(s)` — boolean; false on invalid char or bad checksum
 *  - `mintShortId(rng?)` — convenience: 5 random bytes → 8-char string
 */

// ---------------------------------------------------------------------------
// Alphabet
// ---------------------------------------------------------------------------

/**
 * Crockford base32 alphabet (32 chars). Order matters: index 0 encodes
 * the value 0, index 31 encodes 31. The alphabet is case-insensitive
 * at decode-time; encode produces uppercase.
 */
export const CrockfordAlphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ' as const;
export type CrockfordChar = (typeof CrockfordAlphabet)[number];

const ENCODE_TABLE = CrockfordAlphabet;
const VALID_CHARS = new Set<string>(CrockfordAlphabet);
const DECODE_TABLE: Record<string, number> = (() => {
  const table: Record<string, number> = {};
  for (let i = 0; i < ENCODE_TABLE.length; i++) {
    const char = ENCODE_TABLE[i] as string;
    table[char] = i;
    // Case-insensitive decode: lowercase + the four ambiguous glyphs
    // map to the same index.
    table[char.toLowerCase()] = i;
    if (char === '0') {
      table['O'] = 0;
      table['o'] = 0;
    }
    if (char === '1') {
      table['I'] = 1;
      table['i'] = 1;
      table['L'] = 1;
      table['l'] = 1;
    }
  }
  return table;
})();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Public length of a share-link short-id (chars). */
export const SHORT_ID_LENGTH = 8;

/** Number of random bytes encoded in the short-id (40 bits of entropy). */
export const SHORT_ID_PAYLOAD_BYTES = 5;

/** Mod-31 checksum position (last char). */
const CHECKSUM_INDEX = SHORT_ID_LENGTH - 1;

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

/**
 * Encode `bytes` (must be SHORT_ID_PAYLOAD_BYTES long) into an 8-character
 * Crockford base32 string with a mod-31 checksum appended.
 *
 * The 40-bit payload is packed into 7 base32 chars (35 bits); the bottom
 * 5 bits of `bytes[4]` are dropped. The visible length is always 8 chars
 * regardless of leading zeros in the input bytes.
 */
export function encodeShortId(bytes: Uint8Array): string {
  if (bytes.length !== SHORT_ID_PAYLOAD_BYTES) {
    throw new Error(`encodeShortId expects ${SHORT_ID_PAYLOAD_BYTES} bytes, got ${bytes.length}`);
  }

  // Pack the 5 input bytes into a 40-bit unsigned value.
  let value = 0;
  for (let i = 0; i < SHORT_ID_PAYLOAD_BYTES; i++) {
    value = (value << 8) | (bytes[i] as number);
  }
  // Drop the BOTTOM 5 bits (the low 5 bits of bytes[4]) so the result
  // fits in 35 bits. The decoder reconstructs bytes[4] with its low
  // 5 bits forced to 0, so re-encoding yields the same id.
  const value35 = value >>> 5;

  const body: string[] = new Array(SHORT_ID_LENGTH - 1);
  let v = value35;
  for (let i = SHORT_ID_LENGTH - 2; i >= 0; i--) {
    body[i] = ENCODE_TABLE[v & 0x1f] as string;
    v = v >>> 5;
  }

  // Checksum: weighted sum (position * value) mod 31, position 1-indexed.
  let sum = 0;
  for (let i = 0; i < SHORT_ID_LENGTH - 1; i++) {
    sum = (sum + (i + 1) * DECODE_TABLE[body[i] as string]!) % 31;
  }
  const checksumChar = ENCODE_TABLE[sum] as string;

  return body.join('') + checksumChar;
}

// ---------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------

/**
 * Decode an 8-character Crockford base32 string into a 5-byte payload.
 * Throws `ShortIdError` on invalid characters, wrong length, or bad
 * checksum.
 */
export function decodeShortId(s: string): Uint8Array {
  if (s.length !== SHORT_ID_LENGTH) {
    throw new ShortIdError(`short id must be ${SHORT_ID_LENGTH} chars, got ${s.length}`);
  }
  const chars: string[] = [];
  for (let i = 0; i < SHORT_ID_LENGTH; i++) {
    const c = s[i] as string;
    if (!VALID_CHARS.has(c.toUpperCase())) {
      throw new ShortIdError(`short id contains invalid char "${c}" at position ${i}`);
    }
    chars.push(c);
  }
  // Verify checksum before decoding payload.
  let sum = 0;
  for (let i = 0; i < CHECKSUM_INDEX; i++) {
    sum = (sum + (i + 1) * DECODE_TABLE[chars[i]!]!) % 31;
  }
  const expectedChecksum = DECODE_TABLE[chars[CHECKSUM_INDEX]!];
  if (expectedChecksum !== sum) {
    throw new ShortIdError(
      `short id checksum mismatch (expected ${ENCODE_TABLE[sum]}, got ${chars[CHECKSUM_INDEX]})`,
    );
  }

  // Decode payload — 7 chars × 5 bits = 35 bits. The encoder dropped the
  // bottom 5 bits of bytes[4], so we re-construct the 40-bit value with
  // its low 5 bits = 0.
  let value35 = 0;
  for (let i = 0; i < CHECKSUM_INDEX; i++) {
    value35 = (value35 << 5) | DECODE_TABLE[chars[i]!]!;
  }
  const value = value35 << 5;
  const out = new Uint8Array(SHORT_ID_PAYLOAD_BYTES);
  for (let i = 0; i < SHORT_ID_PAYLOAD_BYTES; i++) {
    out[i] = (value >>> (8 * (SHORT_ID_PAYLOAD_BYTES - 1 - i))) & 0xff;
  }
  return out;
}

/**
 * Validate a short-id without decoding. Returns true iff the string is
 * 8 chars, all are valid Crockford alphabet (case-insensitive), and the
 * checksum matches.
 */
export function validateShortId(s: string): boolean {
  if (s.length !== SHORT_ID_LENGTH) return false;
  let sum = 0;
  for (let i = 0; i < SHORT_ID_LENGTH; i++) {
    const c = s[i] as string;
    const val = DECODE_TABLE[c];
    if (val === undefined) return false;
    if (i < CHECKSUM_INDEX) {
      sum = (sum + (i + 1) * val) % 31;
    } else {
      if (val !== sum) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Convenience
// ---------------------------------------------------------------------------

/**
 * Mint a fresh short-id. Defaults to `crypto.getRandomValues` for the
 * 5 payload bytes. Tests can pass a deterministic RNG.
 */
export function mintShortId(rng: () => Uint8Array = defaultRng): string {
  const bytes = rng();
  return encodeShortId(bytes);
}

function defaultRng(): Uint8Array {
  const out = new Uint8Array(SHORT_ID_PAYLOAD_BYTES);
  globalThis.crypto.getRandomValues(out);
  return out;
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class ShortIdError extends Error {
  readonly code = 'SHORT_ID_ERROR' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ShortIdError';
  }
}
