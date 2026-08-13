/**
 * Transports — wire the batcher to a real HTTP endpoint or a test sink.
 *
 * Three implementations:
 *   * FetchTransport — POSTs JSON with HMAC headers. Default in browser.
 *   * NodeFetchTransport — same as FetchTransport but uses node-fetch;
 *     provided as a convenience for services/event-ingest tests.
 *   * InMemoryTransport — accumulates batches in memory; used in
 *     vitest suites and the integration test in tests/integration/event-ingest.
 */

import type { AnalyticsContext, AnalyticsEvent, AnalyticsTransport } from './types.js';
import { AnalyticsTransportError } from './types.js';
import { signEvents } from './hmac.js';

export interface FetchTransportOptions {
  ingestUrl: string;
  hmacKeyHex: string;
  /** AbortSignal to cancel the request (page unload). */
  signal?: AbortSignal;
  /** Override fetch (for Node tests). */
  fetchImpl?: typeof fetch;
  /** Test-only header overrides. */
  extraHeaders?: Record<string, string>;
}

/**
 * Browser fetch transport. Posts `{ events: [...] }` as JSON with the
 * standard ingest headers (HMAC signature, workspace id, deck id,
 * session id, ts ms).
 */
export class FetchTransport implements AnalyticsTransport {
  private readonly opts: FetchTransportOptions;

  constructor(opts: FetchTransportOptions) {
    this.opts = opts;
  }

  async send(batch: AnalyticsEvent[], ctx: AnalyticsContext): Promise<void> {
    const { body, signature } = signEvents(this.opts.hmacKeyHex, batch);
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-domio-signature': signature,
      'x-domio-workspace-id': ctx.workspace_id,
      'x-domio-deck-id': ctx.deck_id,
      'x-domio-session-id': ctx.session_id ?? '',
      'x-domio-ts-ms': String(Date.now()),
      'x-domio-source-app': ctx.source_app,
      ...this.opts.extraHeaders,
    };
    const f = this.opts.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : null);
    if (!f) throw new AnalyticsTransportError('no fetch implementation');
    const res = await f(this.opts.ingestUrl, {
      method: 'POST',
      body,
      headers,
      ...(this.opts.signal ? { signal: this.opts.signal } : {}),
    });
    if (!res.ok) {
      // 4xx → drop the batch (the server says the request is bad).
      // 5xx + 429 → bubble so the batcher retries.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        await drainBody(res);
        return;
      }
      await drainBody(res);
      throw new AnalyticsTransportError(`ingest failed: ${res.status}`, res.status);
    }
    await drainBody(res);
  }
}

/**
 * In-memory transport for tests. Captures every batch in `received` and
 * resolves immediately. A failure can be injected via `failWith` to
 * exercise the batcher's retry path.
 */
export class InMemoryTransport implements AnalyticsTransport {
  readonly received: AnalyticsEvent[][] = [];
  private fail: ((batch: AnalyticsEvent[]) => Error | null) | null = null;

  constructor(opts: { failWith?: (batch: AnalyticsEvent[]) => Error | null } = {}) {
    this.fail = opts.failWith ?? null;
  }

  async send(batch: AnalyticsEvent[], _ctx: AnalyticsContext): Promise<void> {
    if (this.fail) {
      const err = this.fail(batch);
      if (err) throw err;
    }
    this.received.push(batch.slice());
  }

  totalEvents(): number {
    return this.received.reduce((n, b) => n + b.length, 0);
  }
}

async function drainBody(res: Response): Promise<void> {
  try {
    await res.text();
  } catch {
    /* ignore */
  }
}
