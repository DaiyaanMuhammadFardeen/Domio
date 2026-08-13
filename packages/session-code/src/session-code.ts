/**
 * @domio/session-code — Crockford base32 + 4-bit checksum codes.
 *
 * Phase 16 W1. Used for the `/j/<code>` URL that audiences scan from
 * the pairing QR. The format is:
 *
 *   <4 base32 chars> - <4 base32 chars>
 *
 * 8 visible characters encode 8 * 5 = 40 bits. The last 4 bits hold
 * a checksum (XOR over every 5-bit chunk + length), leaving 36 bits
 * for the session shard + sequence. The split is configurable via
 * the {@link SessionCodeOptions} but the default is 6-bit shard
 * (64 shards) + 30-bit sequence (≈ 1 billion / per shard).
 *
 * Why Crockford: avoids 0/O/1/I/L/U, works case-insensitive, and is
 * a single ASCII byte per character. We never use separators in the
 * persisted form (only display).
 */

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CROCKFORD_LC = '0123456789abcdefghjkmnpqrstvwxyz';

const REVERSE: Record<string, number> = {};
for (let i = 0; i < CROCKFORD.length; i++) {
  const c = CROCKFORD.charAt(i);
  const cl = CROCKFORD_LC.charAt(i);
  if (c !== undefined) REVERSE[c] = i;
  if (cl !== undefined) REVERSE[cl] = i;
}

export interface SessionCodeOptions {
  /** Total number of visible characters (excluding the checksum nibble). Default 8. */
  bodyLength?: number;
  /**
   * Number of leading bits reserved for a shard index. The dashboard
   * uses this to route the request to a specific participant-session
   * shard. Default 6 (64 shards).
   */
  shardBits?: number;
  /** Optional 32-bit seed used when no random source is available. Tests
   *  pin this to make session codes deterministic. */
  random?: () => number;
}

export interface ParsedSessionCode {
  body: string;
  checksum: string;
  shardIndex: number;
  /** Lower 32 bits of the sequence (post-shard). */
  sequence: number;
}

export class SessionCodeError extends Error {
  constructor(reason: string) {
    super(`session-code: ${reason}`);
    this.name = 'SessionCodeError';
  }
}

function defaultRandom(): number {
  return Math.floor(Math.random() * 0xffffffff);
}

function encodeChunk(value: number, bits: number): string {
  let out = '';
  for (let i = bits - 5; i >= 0; i -= 5) {
    const idx = (value >>> i) & 0x1f;
    out += CROCKFORD.charAt(idx);
  }
  return out;
}

function decodeChunk(s: string, bits: number): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charAt(i);
    const v = REVERSE[c];
    if (v === undefined) throw new SessionCodeError(`invalid character: ${c}`);
    n = (n << 5) | v;
  }
  // Mask off the unused upper bits so callers get clean values.
  if (bits < 32) n &= (1 << bits) - 1;
  return n;
}

function checksumNibble(value: number, bodyLength: number): number {
  // 4-bit XOR + length-tagged constant. The body length is folded in
  // so codes that decode to the same bits but different lengths don't
  // share a checksum.
  let x = (value & 0x0f) ^ 0b1010;
  for (let i = 0; i < 4; i++) {
    const bit = (value >>> (i * 4 + 4)) & 0x0f;
    x ^= bit;
  }
  x ^= bodyLength & 0x0f;
  return x & 0x0f;
}

export function generateSessionCode(opts: SessionCodeOptions = {}): string {
  const bodyLength = opts.bodyLength ?? 8;
  const shardBits = opts.shardBits ?? 6;
  const random = opts.random ?? defaultRandom;
  if (bodyLength < 4) throw new SessionCodeError('bodyLength must be >= 4');
  if (shardBits < 0 || shardBits > bodyLength * 5) {
    throw new SessionCodeError('shardBits out of range');
  }
  const totalBits = bodyLength * 5;
  // Compose from two 32-bit randoms so the high bits of the 40-bit
  // body actually vary across calls — a single Math.random() leaves
  // the top ~10 bits constant, which collapses the shard distribution
  // when callers use small-shard configurations.
  const hi = random() >>> 0;
  const lo = random() >>> 0;
  const value = (((hi & 0xff) << 8) | ((lo >>> 24) & 0xff)) % (1 << totalBits);
  const body = encodeChunk(value, totalBits).slice(0, bodyLength);
  const checksum = CROCKFORD.charAt(checksumNibble(value, bodyLength));
  return body + checksum;
}

export function parseSessionCode(code: string): ParsedSessionCode {
  if (code.length < 5) throw new SessionCodeError('code too short');
  const normalised = code.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (normalised.length < 5) throw new SessionCodeError('code too short');
  const checksumChar = normalised.charAt(normalised.length - 1);
  const body = normalised.slice(0, -1);
  const checksum = REVERSE[checksumChar];
  if (checksum === undefined) throw new SessionCodeError('invalid checksum character');
  const value = decodeChunk(body, body.length * 5);
  if (checksumNibble(value, body.length) !== checksum) {
    throw new SessionCodeError('checksum mismatch');
  }
  const shardBits = Math.min(6, body.length * 5);
  const shardMask = (1 << shardBits) - 1;
  return {
    body,
    checksum: checksumChar,
    shardIndex: value & shardMask,
    sequence: value >>> shardBits,
  };
}

export function formatSessionCode(code: string, separator = '-'): string {
  const normalised = code.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (normalised.length < 4) return normalised;
  const mid = Math.floor(normalised.length / 2);
  return normalised.slice(0, mid) + separator + normalised.slice(mid);
}
