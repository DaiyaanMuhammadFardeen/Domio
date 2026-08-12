/**
 * apps/presenter — SessionClient.
 *
 * Talks to the @domio/presenter-session HTTP surface. Every mutation
 * carries the current etag (If-Match) so the service can enforce
 * optimistic concurrency. Idempotency-Key is generated client-side and
 * survives page reloads via sessionStorage.
 *
 * The client is HTTP-only — for low-latency stage updates we also
 * subscribe to the realtime gateway's presenter channel via WebSocket
 * (see ./realtime.ts). The HTTP client is the source-of-truth for
 * mutations; the WS feed is read-only and reconciles any drift.
 */

import type { PresenterSessionState, AdvanceEvent, PairingInfo } from '../runtime/types';

export interface SessionClientOptions {
  /** Base URL of the presenter-session service. Defaults to relative. */
  baseUrl?: string;
  /** Override fetch (used in tests). */
  fetcher?: typeof fetch;
}

export class SessionClientError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
    this.name = 'SessionClientError';
  }
}

export class SessionClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private cachedEtag: string | null = null;
  private cachedState: PresenterSessionState | null = null;

  constructor(opts: SessionClientOptions = {}) {
    this.baseUrl = opts.baseUrl ?? '';
    this.fetcher = opts.fetcher ?? fetch;
  }

  /** Fetch the latest state. Caches etag for subsequent mutations. */
  async get(sessionId: string): Promise<PresenterSessionState> {
    const res = await this.fetcher(`${this.baseUrl}/api/v1/presenter/sessions/${sessionId}`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (!res.ok) {
      throw new SessionClientError(res.status, `GET session: ${res.status}`, await safeBody(res));
    }
    const etag = res.headers.get('etag');
    const body = (await res.json()) as PresenterSessionState;
    if (etag) this.cachedEtag = etag;
    this.cachedState = body;
    return body;
  }

  /** Send a stage advance. Returns the new state and updates the etag. */
  async advance(args: {
    sessionId: string;
    target_slide_id: string;
    target_slide_index: number;
    animation_id?: string;
    animation_frame_ms?: number;
    prototype_variables?: Record<string, unknown>;
  }): Promise<PresenterSessionState> {
    return this.mutate(args.sessionId, 'advance', args);
  }

  /** Retreat (advance to the previous slide). */
  async retreat(args: {
    sessionId: string;
    target_slide_id: string;
    target_slide_index: number;
  }): Promise<PresenterSessionState> {
    return this.mutate(args.sessionId, 'retreat', args);
  }

  /** Jump to a specific slide (via the jump grid). */
  async jump(args: {
    sessionId: string;
    target_slide_id: string;
    target_slide_index: number;
  }): Promise<PresenterSessionState> {
    return this.mutate(args.sessionId, 'advance', args);
  }

  /** Send a heartbeat — keeps the session alive past TTL. */
  async heartbeat(sessionId: string): Promise<PresenterSessionState> {
    const res = await this.fetcher(`${this.baseUrl}/api/v1/presenter/sessions/${sessionId}/heartbeat`, {
      method: 'POST',
      headers: { accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (!res.ok) {
      throw new SessionClientError(res.status, `heartbeat: ${res.status}`, await safeBody(res));
    }
    const etag = res.headers.get('etag');
    const body = (await res.json()) as PresenterSessionState;
    if (etag) this.cachedEtag = etag;
    this.cachedState = body;
    return body;
  }

  /** End the session. Returns the final state snapshot. */
  async end(sessionId: string): Promise<PresenterSessionState> {
    const idempotencyKey = ensureIdempotencyKey(sessionId, 'end');
    const res = await this.fetcher(`${this.baseUrl}/api/v1/presenter/sessions/${sessionId}/end`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(this.cachedEtag ? { 'if-match': this.cachedEtag } : {}),
        'idempotency-key': idempotencyKey,
      },
      credentials: 'same-origin',
    });
    if (!res.ok) {
      throw new SessionClientError(res.status, `end: ${res.status}`, await safeBody(res));
    }
    const etag = res.headers.get('etag');
    const body = (await res.json()) as PresenterSessionState;
    if (etag) this.cachedEtag = etag;
    this.cachedState = body;
    return body;
  }

  /** Get the current pairing QR token for phone-as-remote pairing. */
  async getPairing(sessionId: string): Promise<PairingInfo> {
    const res = await this.fetcher(`${this.baseUrl}/api/v1/presenter/sessions/${sessionId}/pairing`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (!res.ok) {
      throw new SessionClientError(res.status, `pairing: ${res.status}`, await safeBody(res));
    }
    return (await res.json()) as PairingInfo;
  }

  /** Get the latest cached etag (or null if not yet fetched). */
  etag(): string | null {
    return this.cachedEtag;
  }

  /** Latest cached state snapshot (or null). */
  state(): PresenterSessionState | null {
    return this.cachedState;
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private async mutate(
    sessionId: string,
    op: 'advance' | 'retreat',
    body: Record<string, unknown>,
  ): Promise<PresenterSessionState> {
    if (!this.cachedEtag) {
      // Caller forgot to get() first — fetch eagerly so the mutation
      // carries a valid If-Match.
      await this.get(sessionId);
    }
    const idempotencyKey = ensureIdempotencyKey(sessionId, op);
    const res = await this.fetcher(`${this.baseUrl}/api/v1/presenter/sessions/${sessionId}/${op}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(this.cachedEtag ? { 'if-match': this.cachedEtag } : {}),
        'idempotency-key': idempotencyKey,
      },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new SessionClientError(res.status, `${op}: ${res.status}`, await safeBody(res));
    }
    const etag = res.headers.get('etag');
    const next = (await res.json()) as PresenterSessionState;
    if (etag) this.cachedEtag = etag;
    this.cachedState = next;
    return next;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const IDEMPOTENCY_NAMESPACE = 'domio.presenter.idem';
const IDEMPOTENCY_KEY_VERSION = 1;

function ensureIdempotencyKey(sessionId: string, op: string): string {
  if (typeof window === 'undefined') {
    // SSR — no sessionStorage; emit a deterministic key based on time.
    return `ssr-${op}-${sessionId}`;
  }
  const existing = window.sessionStorage.getItem(`${IDEMPOTENCY_NAMESPACE}.${op}.${sessionId}`);
  if (existing) return existing;
  const key = `${IDEMPOTENCY_KEY_VERSION}-${op}-${cryptoRandomHex(8)}`;
  window.sessionStorage.setItem(`${IDEMPOTENCY_NAMESPACE}.${op}.${sessionId}`, key);
  return key;
}

function cryptoRandomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(arr);
  let s = '';
  for (let i = 0; i < bytes; i++) s += (arr[i] as number).toString(16).padStart(2, '0');
  return s;
}

async function safeBody(res: Response): Promise<unknown> {
  try { return await res.json(); } catch { return null; }
}

export type { AdvanceEvent };
export { PresenterSessionState };