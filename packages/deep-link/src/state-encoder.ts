/**
 * StateEncoder / StateDecoder — pure-TS codec for the runtime
 * deep-link payload.
 *
 * Wire format: a single base64url string carrying JSON
 * `{ v, exp, deck_id, ..., sig }` where `sig = HMAC-SHA256(secret,
 * canonicalJson(payloadWithoutSig))`. Canonicalisation is the
 * deterministic key-sorted JSON form (`canonicalJson` below); this
 * keeps encode → decode stable across runtimes and language
 * boundaries.
 *
 * `aud` (audience) is enforced on the decode path: an `embed`
 * token will not open in the `editor` runtime and vice versa. This
 * prevents one audience from being tricked into accepting a token
 * minted for another.
 *
 * Strict mode: any missing required field, wrong type, or version
 * mismatch raises a typed error. There is no "lenient" path —
 * silent acceptance is a security risk.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import {
  DEEP_LINK_VERSION,
  type DeepLinkPayload,
  type DeepLinkAudience,
  type DeepLinkVarEntry,
} from './types.js';
import {
  DeepLinkAudienceMismatchError,
  DeepLinkExpiredError,
  DeepLinkMalformedError,
  DeepLinkSignatureError,
  DeepLinkVersionError,
} from './errors.js';

/** Encode a payload to its base64url token. */
export interface StateEncoderOptions {
  /** HMAC-SHA256 key id (used by the decoder to look up the right key). */
  readonly kid: string;
  /** HMAC-SHA256 32-byte secret, base64url encoded. */
  readonly key: string;
}

/** Required fields on the encode side (everything except `sig`). */
type WireInput = Omit<DeepLinkPayload, 'sig'>;

const REQUIRED_FIELDS: readonly (keyof WireInput)[] = [
  'v',
  'exp',
  'deck_id',
  'slide_id',
  'path_stack',
  'overlay_stack',
  'var_snapshot',
  'device_frame_state',
  'scenario',
  'form_drafts',
  'aud',
];

/** Sort object keys recursively so the JSON form is canonical. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const body = keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',');
  return `{${body}}`;
}

/** Convert bytes to base64url (no padding). */
function bytesToB64Url(bytes: Uint8Array): string {
  const base = Buffer.from(bytes).toString('base64');
  return base.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Convert base64url (with or without padding) to a Buffer. */
function b64UrlToBytes(s: string): Buffer {
  // Tolerate both padded and unpadded base64url.
  const pad = s.length % 4;
  const norm = pad === 0 ? s : s + '='.repeat(4 - pad);
  return Buffer.from(norm.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/** HMAC-SHA256 → base64url string. */
function hmacSign(secretB64: string, message: string): string {
  const secret = b64UrlToBytes(secretB64);
  if (secret.length < 16) {
    throw new Error('HMAC secret must decode to at least 16 bytes');
  }
  return bytesToB64Url(createHmac('sha256', secret).update(message).digest());
}

/** HMAC-SHA256 timing-safe equality. */
function hmacVerify(secretB64: string, message: string, providedB64: string): boolean {
  const secret = b64UrlToBytes(secretB64);
  const expected = createHmac('sha256', secret).update(message).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(providedB64, 'base64url');
  } catch {
    return false;
  }
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

/** Generate a 32-byte HMAC key, base64url encoded. */
export function generateKey(): string {
  return bytesToB64Url(randomBytes(32));
}

/**
 * Encode a payload to a single base64url token. `kid` is carried
 * out-of-band (typically in the short-link record, not the token),
 * so the decoder knows which key to look up.
 */
export function encodePayload(input: WireInput, opts: StateEncoderOptions): string {
  for (const f of REQUIRED_FIELDS) {
    if (!(f in input)) {
      throw new DeepLinkMalformedError(`Missing required field on encode: ${f}`);
    }
  }
  if (input.v !== DEEP_LINK_VERSION) {
    throw new DeepLinkVersionError(
      `Cannot encode wire version ${input.v}; expected ${DEEP_LINK_VERSION}`,
    );
  }
  const sig = hmacSign(opts.key, canonicalJson(input));
  const signed: DeepLinkPayload = { ...input, sig };
  return bytesToB64Url(Buffer.from(canonicalJson(signed), 'utf8'));
}

export interface StateDecoderOptions {
  readonly kid: string;
  readonly key: string;
  /** Resolver-side audience the caller is asking for. */
  readonly audience: DeepLinkAudience;
  /** Resolver-side clock, ms since epoch. */
  readonly now: number;
}

/**
 * Decode a base64url token and verify the HMAC. Returns the
 * payload (sans signature) on success; throws a typed
 * `DeepLinkError` subclass on any failure.
 */
export function decodePayload(token: string, opts: StateDecoderOptions): DeepLinkPayload {
  if (typeof token !== 'string' || token.length === 0) {
    throw new DeepLinkMalformedError('Token is empty');
  }
  let raw: string;
  try {
    raw = Buffer.from(b64UrlToBytes(token)).toString('utf8');
  } catch {
    throw new DeepLinkMalformedError('Token is not valid base64url');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new DeepLinkMalformedError('Token payload is not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new DeepLinkMalformedError('Token payload must be a JSON object');
  }
  const obj = parsed as Record<string, unknown>;
  for (const f of [...REQUIRED_FIELDS, 'sig' as const]) {
    if (!(f in obj)) {
      throw new DeepLinkMalformedError(`Missing required field on decode: ${f}`);
    }
  }
  if (obj['v'] !== DEEP_LINK_VERSION) {
    throw new DeepLinkVersionError(
      `Wire version mismatch: got ${String(obj['v'])}, expected ${DEEP_LINK_VERSION}`,
    );
  }
  if (obj['aud'] !== opts.audience) {
    throw new DeepLinkAudienceMismatchError(
      `Token aud=${String(obj['aud'])} but resolver asked for ${opts.audience}`,
    );
  }
  const exp = obj['exp'];
  if (typeof exp !== 'number' || !Number.isFinite(exp)) {
    throw new DeepLinkMalformedError('exp must be a finite number');
  }
  if (opts.now > exp) {
    throw new DeepLinkExpiredError(`Token expired at ${new Date(exp).toISOString()}`);
  }
  const sig = obj['sig'];
  if (typeof sig !== 'string') {
    throw new DeepLinkMalformedError('sig must be a string');
  }
  // Verify the HMAC over the canonical JSON of every field except sig.
  const wireInput: WireInput = {
    v: obj['v'] as typeof DEEP_LINK_VERSION,
    exp,
    deck_id: String(obj['deck_id']),
    slide_id: String(obj['slide_id']),
    path_stack: Array.isArray(obj['path_stack']) ? (obj['path_stack'] as string[]).slice() : [],
    overlay_stack: Array.isArray(obj['overlay_stack'])
      ? (obj['overlay_stack'] as string[]).slice()
      : [],
    var_snapshot: Array.isArray(obj['var_snapshot'])
      ? (obj['var_snapshot'] as DeepLinkVarEntry[]).slice()
      : [],
    device_frame_state: (obj['device_frame_state'] as Record<string, unknown> | null) ?? {},
    scenario: String(obj['scenario'] ?? ''),
    form_drafts: (obj['form_drafts'] as Record<string, unknown> | null) ?? {},
    aud: obj['aud'] as DeepLinkAudience,
  };
  if (obj['tenant_id'] !== undefined) {
    (wireInput as { tenant_id?: string }).tenant_id = String(obj['tenant_id']);
  }
  const ok = hmacVerify(opts.key, canonicalJson(wireInput), sig);
  if (!ok) {
    throw new DeepLinkSignatureError();
  }
  return { ...wireInput, sig };
}

/**
 * `StateEncoder` is a thin stateful wrapper so the service layer
 * doesn't have to thread `{ kid, key }` through every call. It is
 * deliberately a one-key-per-instance object — multi-key support
 * is the rotator's job (see `key-rotation.ts`).
 */
export class StateEncoder {
  private readonly opts: StateEncoderOptions;
  constructor(opts: StateEncoderOptions) {
    if (!opts.kid) throw new Error('StateEncoder requires a kid');
    if (!opts.key) throw new Error('StateEncoder requires a key');
    this.opts = opts;
  }
  get kid(): string {
    return this.opts.kid;
  }
  encode(payload: WireInput): string {
    return encodePayload(payload, this.opts);
  }
}

/** Stateful wrapper around `decodePayload` for symmetry. */
export class StateDecoder {
  private readonly opts: StateDecoderOptions;
  constructor(opts: StateDecoderOptions) {
    if (!opts.kid) throw new Error('StateDecoder requires a kid');
    if (!opts.key) throw new Error('StateDecoder requires a key');
    this.opts = opts;
  }
  get kid(): string {
    return this.opts.kid;
  }
  decode(token: string): DeepLinkPayload {
    return decodePayload(token, this.opts);
  }
}
