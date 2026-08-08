'use client';

/**
 * HandoffClient — runtime for presenter-to-presenter session handover.
 *
 * The client mirrors the API surface:
 *   - mint(sessionId, toPresenterId, ttlMs?) → { token, expires_at_ms,
 *     expected_version }.
 *   - apply(sessionId, toPresenterId, token, state, etag) → updated session.
 *
 * The etag is carried via `If-Match`. The mint returns `expected_version`
 * which the caller presents back when applying — the server validates
 * the version both via the row etag and via the token's pinned
 * `expected_version`.
 */

export interface HandoffMintResult {
  token: string;
  expires_at_ms: number;
  expected_version: number;
}

export class HandoffClientError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'HandoffClientError';
  }
}

export class HandoffClient {
  constructor(private readonly opts: { baseUrl?: string; fetchImpl?: typeof fetch } = {}) {}

  async mint(sessionId: string, toPresenterId: string, ttlMs?: number): Promise<HandoffMintResult> {
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const res = await fetchImpl(`${this.opts.baseUrl ?? ''}/v1/presenter/sessions/${sessionId}/handover/init`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-actor-id': 'presenter-self',
      },
      body: JSON.stringify({ to_presenter_id: toPresenterId, ...(ttlMs !== undefined ? { ttl_ms: ttlMs } : {}) }),
      credentials: 'same-origin',
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      throw new HandoffClientError(res.status, body.message ?? `mint failed (HTTP ${res.status})`);
    }
    return (await res.json()) as HandoffMintResult;
  }

  async apply(input: {
    sessionId: string;
    toPresenterId: string;
    token: string;
    state: Record<string, unknown>;
    etag: string;
  }): Promise<Record<string, unknown>> {
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const res = await fetchImpl(`${this.opts.baseUrl ?? ''}/v1/presenter/sessions/${input.sessionId}/handover`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'if-match': input.etag,
        'x-actor-id': input.toPresenterId,
      },
      body: JSON.stringify({
        to_presenter_id: input.toPresenterId,
        state_snapshot: input.state,
        transfer_token: input.token,
      }),
      credentials: 'same-origin',
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      throw new HandoffClientError(res.status, body.message ?? `apply failed (HTTP ${res.status})`);
    }
    return (await res.json()) as Record<string, unknown>;
  }
}
