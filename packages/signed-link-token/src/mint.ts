/**
 * @domio/signed-link-token — token minting.
 *
 * Phase 14 W1. The signed-link-token is a base64url-encoded blob:
 *
 *     <payload_b64>.<expires_at_unix_sec>.<nonce_b64>.<hmac_b64>
 *
 *  - payload_b64   : JSON-encoded ViewerClaims (workspace_id, link_id,
 *                    audience, etc.). Small (< 256 bytes).
 *  - expires_at    : integer unix-seconds. Expired tokens are rejected.
 *  - nonce         : 128 bits of random data. Single-use within TTL.
 *  - hmac          : HMAC-SHA256(server_key, "<payload>.<expires_at>.<nonce>")
 *
 * The server_key is a per-workspace secret (>= 32 bytes, hex-encoded).
 * Verification is constant-time and rejects expired tokens, replayed
 * nonces, and tampered signatures.
 *
 * Public API:
 *  - `mintLinkToken(input, key, opts?)` → string.
 *  - `ViewerClaims` — payload type.
 *  - `MintOptions` — clock + nonce store (for nonce reservation at mint).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Claims attached to a minted link token. These travel with the token
 * and are returned to the introspect caller without a DB lookup.
 */
export interface ViewerClaims {
  readonly workspace_id: string;
  readonly link_id: string;
  readonly short_id: string;
  /** Optional audience hint; populated when the token is minted for a
   *  specific viewer (e.g. an email allowlist entry). */
  readonly audience?: string;
  /** Optional grant set: capabilities the viewer has on this deck
   *  (e.g. ["view", "download"]). Evaluated by the viewer (W5/W6). */
  readonly grants?: readonly string[];
  /** Issuer — typically the workspace short name. */
  readonly iss?: string;
  /** Subject — typically the user identifier when the link is bound. */
  readonly sub?: string;
}

export interface MintInput {
  readonly claims: ViewerClaims;
  /** Expiry as a Date or unix-seconds. */
  readonly expiresAt: Date | number;
  /** Caller-supplied 16-byte random nonce. Required for deterministic
   *  tests; production omits this and lets the minter generate it. */
  readonly nonce?: Uint8Array;
}

export interface MintOptions {
  /** Random source for nonce generation; default `crypto.getRandomValues`. */
  readonly random?: (n: number) => Uint8Array;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class TokenMintError extends Error {
  readonly code = 'TOKEN_MINT_ERROR' as const;
  constructor(message: string) {
    super(message);
    this.name = 'TokenMintError';
  }
}

// ---------------------------------------------------------------------------
// Mint
// ---------------------------------------------------------------------------

/**
 * Mint a signed link token. Returns the base64url string.
 *
 * The token format is `<payload_b64>.<expires_at_sec>.<nonce_b64>.<hmac_b64>`.
 * HMAC is computed over the first three dot-separated fields.
 */
export async function mintLinkToken(
  input: MintInput,
  key: Uint8Array,
  opts: MintOptions = {},
): Promise<string> {
  if (key.length < 32) {
    throw new TokenMintError(`HMAC key must be >= 32 bytes, got ${key.length}`);
  }

  const random = opts.random ?? defaultRandom;

  const expiresAtSec =
    input.expiresAt instanceof Date
      ? Math.floor(input.expiresAt.getTime() / 1000)
      : input.expiresAt;

  if (!Number.isFinite(expiresAtSec)) {
    throw new TokenMintError(`Invalid expiresAt: ${String(input.expiresAt)}`);
  }

  const nonce = input.nonce ?? random(16);
  if (nonce.length < 8) {
    throw new TokenMintError(`nonce must be >= 8 bytes, got ${nonce.length}`);
  }

  const payloadJson = JSON.stringify(input.claims);
  const payloadB64 = toBase64Url(new TextEncoder().encode(payloadJson));
  const expiresStr = String(expiresAtSec);
  const nonceB64 = toBase64Url(nonce);

  const message = `${payloadB64}.${expiresStr}.${nonceB64}`;
  const hmac = await hmacSha256(new TextEncoder().encode(message), key);
  const hmacB64 = toBase64Url(hmac);

  // Note: we deliberately do NOT pre-record the nonce here. The nonce
  // is recorded by the verifier on first verify; pre-recording would
  // burn the token before anyone has presented it. The nonce store
  // option is accepted for API symmetry with verify but is unused
  // during mint.

  return `${message}.${hmacB64}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultRandom(n: number): Uint8Array {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

// HMAC-SHA256 via WebCrypto (works in Node 22+ and the browser).
async function hmacSha256(message: Uint8Array, key: Uint8Array): Promise<Uint8Array> {
  const subtle = globalThis.crypto.subtle;
  const cryptoKey = await subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await subtle.sign('HMAC', cryptoKey, message as BufferSource);
  return new Uint8Array(sig);
}

// Base64url encode (RFC 4648 §5). No padding.
export function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i] as number);
  }
  const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Re-export for downstream convenience.
export { hmacSha256 };
