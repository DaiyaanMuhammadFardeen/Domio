import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Content-addressing primitive — sha256 hex of bytes. */
export function sha256Hex(input: Uint8Array | string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Canonical JSON hash used to verify a package manifest against its body. */
export function canonicalHash(body: unknown): string {
  return sha256Hex(JSON.stringify(body));
}

/**
 * Compact JWS (RFC 7515) sign/verify using HMAC-SHA256 via node crypto.
 * Deterministic and dependency-free; used for license grants.
 */
const b64url = (buf: Buffer | Uint8Array): string =>
  Buffer.from(buf).toString('base64url');
const b64urlJson = (obj: unknown): string => b64url(Buffer.from(JSON.stringify(obj), 'utf8'));

export function signJws(payload: Record<string, unknown>, secret: string, header?: Record<string, string>): string {
  const protectedHeader = b64urlJson({ alg: 'HS256', typ: 'JWT', ...header });
  const encodedPayload = b64urlJson(payload);
  const signingInput = `${protectedHeader}.${encodedPayload}`;
  const sig = createHmac('sha256', secret).update(signingInput).digest();
  return `${signingInput}.${b64url(sig)}`;
}

export interface VerifyResult {
  valid: boolean;
  payload?: Record<string, unknown>;
  reason?: string;
}

export function verifyJws(token: string, secret: string): VerifyResult {
  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false, reason: 'malformed' };
  const header = parts[0]!;
  const payload = parts[1]!;
  const sigB64 = parts[2]!;
  const expected = createHmac('sha256', secret).update(`${header}.${payload}`).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(sigB64, 'base64url');
  } catch {
    return { valid: false, reason: 'malformed' };
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { valid: false, reason: 'bad-signature' };
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, reason: 'malformed' };
  }
  if (typeof decoded !== 'object' || decoded === null) return { valid: false, reason: 'malformed' };
  return { valid: true, payload: decoded as Record<string, unknown> };
}

/**
 * Signed-URL generation (CloudFront-style query signature).
 * The signature covers method + path + expiry so the URL cannot be replayed
 * past its TTL or repurposed for another object.
 */
export function signUrl(
  method: string,
  path: string,
  secret: string,
  expiresAtMs: number,
  policy: string = '',
): string {
  const sep = path.includes('?') ? '&' : '?';
  const sig = createHmac('sha256', secret)
    .update(`${method}|${path}|${expiresAtMs}|${policy}`)
    .digest('hex');
  return `${path}${sep}expires=${expiresAtMs}&policy=${encodeURIComponent(policy)}&sig=${sig}`;
}

export function verifySignedUrl(
  method: string,
  path: string,
  secret: string,
  nowMs: number,
): { valid: boolean; reason?: string } {
  const [base, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  const expires = Number(params.get('expires'));
  const sig = params.get('sig') ?? '';
  const policy = params.get('policy') ?? '';
  if (!expires || !sig) return { valid: false, reason: 'missing-params' };
  if (nowMs > expires) return { valid: false, reason: 'expired' };
  const expected = createHmac('sha256', secret)
    .update(`${method}|${base}|${expires}|${policy}`)
    .digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(sig, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { valid: false, reason: 'bad-signature' };
  return { valid: true };
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // ULID alphabet (no I,L,O,U)

/** ULID generator: 48-bit ms timestamp + 80 bits of randomness, Crockford base32. */
export function ulid(nowMs: number = Date.now()): string {
  const time = nowMs.toString(16).padStart(12, '0');
  const encTime = encodeCrockford(BigInt(`0x${time}`), 10);
  const rand = randomBytes(10);
  const encRand = encodeCrockford(BigInt(`0x${rand.toString('hex')}`), 16);
  return encTime + encRand;
}

function encodeCrockford(value: bigint, width: number): string {
  let out = '';
  let v = value;
  for (let i = 0; i < width; i++) {
    out = CROCKFORD[Number(v & 31n)] + out;
    v >>= 5n;
  }
  return out;
}

export function uuid(): string {
  return randomBytes(16).toString('hex');
}
