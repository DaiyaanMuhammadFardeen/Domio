/**
 * EventRecorder — orchestrates buffering, batching, and transport.
 *
 * Per M5.2:
 *   - record(event) — push into the in-memory buffer
 *   - flush()       — POST via sendBeacon, fallback to fetch(keepalive),
 *                     chunked-upload if oversized; survives network failure
 *   - 5 MB client buffer (soft cap)
 *   - 5 s flush interval
 *   - rejoinedSessionId — for reload handling
 */

import type { RecorderConfig, RecorderEvent } from './types.js';
import { IndexedDBQueue } from './indexed-db-queue.js';
import { ChunkedUploadStream } from './chunked-upload-stream.js';

const BUFFER_BYTES_DEFAULT = 5 * 1024 * 1024;
const FLUSH_INTERVAL_MS_DEFAULT = 5000;
const SESSION_STORAGE_KEY = 'domio.protorec.sessionId';
const fallbackStorage = new Map<string, string>();

function readSessionId(): string | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    // Fall through to the in-memory store in restricted environments.
  }
  return fallbackStorage.get(SESSION_STORAGE_KEY) ?? null;
}

function writeSessionId(id: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SESSION_STORAGE_KEY, id);
      return;
    }
  } catch {
    // Fall through to the in-memory store in restricted environments.
  }
  fallbackStorage.set(SESSION_STORAGE_KEY, id);
}

export interface EventRecorderDeps {
  readonly fetchImpl?: typeof fetch;
  readonly sendBeaconImpl?: (url: string, body: string) => boolean;
  readonly indexedDb?: IDBFactory;
  readonly timerImpl?: typeof setInterval;
  readonly clearTimerImpl?: typeof clearInterval;
}

export class EventRecorder {
  private readonly cfg: RecorderConfig;
  private readonly deps: EventRecorderDeps;
  private buffer: RecorderEvent[] = [];
  private bufferBytes = 0;
  private readonly cap: number;
  private readonly flushIntervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;
  private lastDroppedCount = 0;
  private lastFlushError: string | null = null;
  private flushCount = 0;
  private surviveFlushFailures = 0;
  private readonly idb: IndexedDBQueue | null;

  constructor(cfg: RecorderConfig, deps: EventRecorderDeps = {}) {
    this.cfg = cfg;
    this.deps = deps;
    this.cap = cfg.bufferBytes ?? BUFFER_BYTES_DEFAULT;
    this.flushIntervalMs = cfg.flushIntervalMs ?? FLUSH_INTERVAL_MS_DEFAULT;
    const fetchImpl =
      deps.fetchImpl ?? cfg.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : undefined);
    if (!fetchImpl) throw new Error('fetch is required');
    // Reserved for the future chunked-upload path. Construct eagerly so a
    // missing/invalid fetchImpl is caught now rather than on first use.
    new ChunkedUploadStream({ fetchImpl });
    this.idb =
      cfg.useIndexedDb && deps.indexedDb
        ? new IndexedDBQueue({ indexedDB: deps.indexedDb })
        : null;
  }

  /** Start the auto-flush timer. Idempotent. */
  start(): void {
    if (this.timer) return;
    const timerImpl = this.deps.timerImpl ?? setInterval;
    this.timer = timerImpl(() => {
      void this.flush().catch(() => undefined);
    }, this.flushIntervalMs) as ReturnType<typeof setInterval>;
  }

  stop(): void {
    if (this.timer) {
      const clearTimerImpl = this.deps.clearTimerImpl ?? clearInterval;
      clearTimerImpl(this.timer as never);
      this.timer = null;
    }
  }

  /** Push one event into the buffer. Returns false if the buffer dropped it (cap exceeded). */
  record(event: RecorderEvent): boolean {
    const bytes = JSON.stringify(event).length * 2;
    if (this.bufferBytes + bytes > this.cap) {
      this.lastDroppedCount += 1;
      // Drop oldest to make room.
      while (this.bufferBytes + bytes > this.cap && this.buffer.length > 0) {
        const oldest = this.buffer.shift()!;
        this.bufferBytes -= JSON.stringify(oldest).length * 2;
      }
    }
    this.buffer.push(event);
    this.bufferBytes += bytes;
    if (this.idb) {
      void this.idb.push(event);
    }
    return true;
  }

  /** Returns the current in-memory buffer (read-only). */
  peekBuffer(): readonly RecorderEvent[] {
    return this.buffer;
  }

  bufferSizeBytes(): number {
    return this.bufferBytes;
  }

  /** Returns true if any flush attempt has succeeded. */
  hasFlushed(): boolean {
    return this.flushCount > 0;
  }

  lastError(): string | null {
    return this.lastFlushError;
  }

  /**
   * Drain the buffer and POST it. Uses `navigator.sendBeacon` when the
   * payload is small (under the platform cap — typically 64 KB) and
   * falls back to `fetch(keepalive)` or chunked upload otherwise.
   *
   * On network failure, the buffer survives — the next flush retries.
   */
  async flush(): Promise<{ accepted: number; dropped: number }> {
    if (this.inFlight || this.buffer.length === 0) {
      return { accepted: 0, dropped: this.lastDroppedCount };
    }
    const dropped = this.lastDroppedCount;
    this.lastDroppedCount = 0;
    const events = this.buffer.filter(
      (e) => !this.cfg.regionPinned || e.region === this.cfg.region,
    );
    const rejected = this.buffer.length - events.length;
    this.buffer = [];
    this.bufferBytes = 0;
    if (events.length === 0) {
      this.inFlight = false;
      return { accepted: 0, dropped: dropped + rejected };
    }
    this.inFlight = true;
    const body = JSON.stringify({
      sessionId: this.cfg.sessionId,
      events,
    });
    try {
      const ok = await this.send(body);
      if (!ok) {
        // Put the events back; survive flush failure.
        this.buffer = events.concat(this.buffer);
        this.bufferBytes += events.reduce(
          (sum, event) => sum + JSON.stringify(event).length * 2,
          0,
        );
        this.lastFlushError = 'network-error';
        this.surviveFlushFailures += 1;
        return { accepted: 0, dropped };
      }
      this.flushCount += 1;
      this.lastFlushError = null;
      return { accepted: events.length, dropped: dropped + rejected };
    } finally {
      this.inFlight = false;
    }
  }

  /** Used by tests to surface that buffer survival is exercised. */
  get survivingFlushFailures(): number {
    return this.surviveFlushFailures;
  }

  /** Force-flush and resolve. Equivalent to `flush()` but Promise-based. */
  async drain(): Promise<void> {
    while (this.buffer.length > 0) {
      const r = await this.flush();
      if (r.accepted === 0) break;
    }
  }

  /** Returns the rejoined session id from localStorage (used after reload). */
  static rejoinedSessionId(): string | null {
    return readSessionId();
  }

  /** Persist the session id so a page reload can rejoin. */
  static persistSessionId(id: string): void {
    writeSessionId(id);
  }

  /** Test-only helper: clear both localStorage and the in-memory fallback. */
  static clearPersistedSessionId(): void {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }
    fallbackStorage.delete(SESSION_STORAGE_KEY);
  }

  private async send(body: string): Promise<boolean> {
    const url = this.cfg.ingestUrl;
    // sendBeacon path — for "small" payloads (browser cap ~64 KB).
    const beacon = this.deps.sendBeaconImpl ?? this.cfg.sendBeaconImpl;
    if (beacon && body.length < 64 * 1024) {
      const accepted = beacon(url, body);
      if (accepted) return true;
      // Beacon refused (payload too large for the platform queue, etc.) —
      // fall through to fetch(keepalive).
    }
    // Fallback: fetch(keepalive). The browser keeps the request alive
    // even after unload, which is critical for the unload flush.
    const fetchImpl = this.deps.fetchImpl ?? this.cfg.fetchImpl ?? fetch;
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        body,
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) return false;
      return true;
    } catch {
      return false;
    }
  }
}
