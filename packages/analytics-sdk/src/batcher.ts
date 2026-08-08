/**
 * Batcher — buffers events, flushes on size / time.
 *
 * Flush triggers (whichever comes first):
 *   * `maxBatchSize` events queued
 *   * `maxBatchBytes` bytes queued
 *   * `flushIntervalMs` elapsed since last flush
 *
 * On flush, the batch is sent through the transport. On transport
 * failure the events stay in the queue (re-enqueued) so they can be
 * retried. The queue store is durable (IDB in browser, in-memory in
 * tests) so an abrupt page close does not lose buffered events.
 *
 * Note: the SDK does not dedupe across flushes. services/event-ingest
 * is responsible for idempotency via the `Idempotency-Key` header.
 */

import type {
  AnalyticsConfig,
  AnalyticsEvent,
  AnalyticsContext,
  AnalyticsTransport,
  QueueStore,
  QueuedEvent,
} from './types.js';
import { stripEvent } from './pii.js';
import { signEvents } from './hmac.js';

const DEFAULTS = {
  maxBatchSize: 50,
  maxBatchBytes: 5 * 1024,
  flushIntervalMs: 2000,
};

export interface BatcherOptions extends AnalyticsConfig {
  context: AnalyticsContext;
  transport: AnalyticsTransport;
  queue: QueueStore;
}

export class Batcher {
  private readonly opts: Required<Omit<AnalyticsConfig, 'honorDnt' | 'random' | 'now' | 'transport' | 'queueStore'>> & {
    honorDnt: boolean;
    random: () => number;
    now: () => number;
    transport: AnalyticsTransport;
    queue: QueueStore;
  };
  private readonly context: AnalyticsContext;
  private readonly transport: AnalyticsTransport;
  private readonly queue: QueueStore;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private seq = 0;
  private closed = false;

  constructor(opts: BatcherOptions) {
    this.context = opts.context;
    this.transport = opts.transport;
    this.queue = opts.queueStore ?? opts.queue;
    this.opts = {
      ingestUrl: opts.ingestUrl,
      hmacKeyHex: opts.hmacKeyHex,
      maxBatchSize: opts.maxBatchSize ?? DEFAULTS.maxBatchSize,
      maxBatchBytes: opts.maxBatchBytes ?? DEFAULTS.maxBatchBytes,
      flushIntervalMs: opts.flushIntervalMs ?? DEFAULTS.flushIntervalMs,
      honorDnt: opts.honorDnt ?? true,
      random: opts.random ?? Math.random,
      now: opts.now ?? Date.now,
      transport: opts.transport,
      queue: this.queue,
    };
  }

  /** Start the periodic flush. Idempotent. */
  start(): void {
    if (this.flushTimer || this.closed) return;
    this.flushTimer = setInterval(() => {
      void this.flush().catch(() => {
        /* errors logged in flush */
      });
    }, this.opts.flushIntervalMs);
    // Don't keep the process alive purely for the flush timer.
    if (typeof (this.flushTimer as { unref?: () => void }).unref === 'function') {
      (this.flushTimer as { unref: () => void }).unref();
    }
  }

  /** Stop the periodic flush and drain. */
  async stop(): Promise<void> {
    this.closed = true;
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  /** Enqueue an event. Applies PII strip + size cap. */
  async enqueue(event: AnalyticsEvent): Promise<void> {
    const scrubbed = stripEvent(event);
    const payload = JSON.stringify(scrubbed);
    const bytes = byteLength(payload);
    this.seq += 1;
    const record: QueuedEvent = {
      event_id: scrubbed.event_id,
      seq: this.seq,
      bytes,
      event: scrubbed as AnalyticsEvent,
      dropped: 0,
    };
    await this.queue.enqueue(record);
  }

  /** Force an immediate flush. */
  async flush(): Promise<void> {
    if (this.closed && (await this.queue.count()) === 0) return;
    const max = this.opts.maxBatchSize;
    const records = await this.queue.peek(max);
    if (records.length === 0) return;
    const events = records.map((r) => r.event);
    try {
      await this.transport.send(events, this.context);
      await this.queue.drop(records.map((r) => r.seq));
    } catch (err) {
      // Leave events in the queue; next flush retries.
      // The transport is responsible for backoff (5xx → retry, 4xx → drop).
      // We log here so dev surfaces the issue; production sinks this via
      // window.__domio_analytics_log if present.
      logFlushError(err);
    }
  }

  /** Build the signed body for a batch — useful for tests + curl. */
  buildSignedBody(events: readonly AnalyticsEvent[]): { body: string; signature: string } {
    return signEvents(this.opts.hmacKeyHex, events);
  }

  /** Drop everything (panic reset; rarely used). */
  async reset(): Promise<void> {
    const all = await this.queue.peek(1000);
    await this.queue.drop(all.map((r) => r.seq));
  }
}

function byteLength(s: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(s).byteLength;
  }
  return Buffer.byteLength(s, 'utf8');
}

function logFlushError(err: unknown): void {
  if (typeof window !== 'undefined') {
    const w = window as unknown as { __domio_analytics_log?: (msg: string, err: unknown) => void };
    if (typeof w.__domio_analytics_log === 'function') {
      w.__domio_analytics_log('analytics-sdk flush failed', err);
      return;
    }
  }
  // Node fallback — silence.
  void err;
}
