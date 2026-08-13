/**
 * apps/presenter — PlanClient.
 *
 * Talks to the @domio/presenter-session /plan endpoint. Mutations carry
 * the current session etag (If-Match).
 */

import type { PresenterSessionState } from './types';

export interface PlanPatch {
  order?: string[];
  hidden?: string[];
}

export class PlanClientError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
    this.name = 'PlanClientError';
  }
}

export interface PlanClientOptions {
  baseUrl?: string;
  fetcher?: typeof fetch;
}

export class PlanClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private cachedEtag: string | null = null;

  constructor(opts: PlanClientOptions = {}) {
    this.baseUrl = opts.baseUrl ?? '';
    this.fetcher = opts.fetcher ?? fetch;
  }

  etag(): string | null {
    return this.cachedEtag;
  }
  setEtag(etag: string | null): void {
    this.cachedEtag = etag;
  }

  async patch(sessionId: string, body: PlanPatch): Promise<PresenterSessionState> {
    const idempotencyKey = ensureIdempotencyKey(sessionId, 'plan');
    const res = await this.fetcher(`${this.baseUrl}/api/v1/presenter/sessions/${sessionId}/plan`, {
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
      throw new PlanClientError(res.status, `plan: ${res.status}`, await safeBody(res));
    }
    const etag = res.headers.get('etag');
    if (etag) this.cachedEtag = etag;
    return (await res.json()) as PresenterSessionState;
  }
}

async function safeBody(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

const NS = 'domio.presenter.plan.idem';
function ensureIdempotencyKey(sessionId: string, op: string): string {
  if (typeof window === 'undefined') return `ssr-${op}-${sessionId}`;
  const existing = window.sessionStorage.getItem(`${NS}.${sessionId}`);
  if (existing) return existing;
  const fresh = `${op}-${cryptoRandomHex(8)}`;
  window.sessionStorage.setItem(`${NS}.${sessionId}`, fresh);
  return fresh;
}

function cryptoRandomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(arr);
  let s = '';
  for (let i = 0; i < bytes; i++) s += (arr[i] as number).toString(16).padStart(2, '0');
  return s;
}
