/**
 * @domio/handout-generator — signed deep-link URLs.
 *
 * Phase 16 W9. Issues an HMAC-signed token for `/h/<token>` that
 * resolves to a session handout page. Tokens carry (workspace_id,
 * session_id, scorm_package, expires_at_ms).
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

export interface HandoutInput {
  readonly workspace_id: string;
  readonly session_id: string;
  readonly scorm_package?: string;
  readonly ttl_ms?: number;
}

export interface SignedHandout {
  readonly token: string;
  readonly url: string;
  readonly expires_at_ms: number;
}

export interface HandoutPayload {
  readonly workspace_id: string;
  readonly session_id: string;
  readonly scorm_package: string | null;
  readonly expires_at_ms: number;
  readonly nonce: string;
}

export class HandoutGenerator {
  private readonly key: Uint8Array;
  private readonly base_url: string;

  constructor(opts: { key: Uint8Array; base_url?: string }) {
    this.key = opts.key;
    this.base_url = opts.base_url ?? 'https://join.domio.example';
  }

  mint(input: HandoutInput, now_ms: number = Date.now()): SignedHandout {
    const ttl = input.ttl_ms ?? 30 * 24 * 60 * 60 * 1000;
    const payload: HandoutPayload = {
      workspace_id: input.workspace_id,
      session_id: input.session_id,
      scorm_package: input.scorm_package ?? null,
      expires_at_ms: now_ms + ttl,
      nonce: randomBytes(8).toString('hex'),
    };
    const json = JSON.stringify(payload);
    const b64 = Buffer.from(json).toString('base64url');
    const mac = createHmac('sha256', this.key).update(b64).digest('base64url');
    const token = `${b64}.${mac}`;
    return { token, url: `${this.base_url}/h/${token}`, expires_at_ms: payload.expires_at_ms };
  }

  verify(token: string, now_ms: number = Date.now()): HandoutPayload | null {
    const [b64, mac] = token.split('.');
    if (!b64 || !mac) return null;
    const expected = createHmac('sha256', this.key).update(b64).digest('base64url');
    if (expected.length !== mac.length) return null;
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(mac))) return null;
    const json = Buffer.from(b64, 'base64url').toString('utf8');
    let payload: HandoutPayload;
    try {
      payload = JSON.parse(json) as HandoutPayload;
    } catch {
      return null;
    }
    if (payload.expires_at_ms < now_ms) return null;
    return payload;
  }
}