/**
 * AnalyticsClient — high-level facade.
 *
 * Construct one per app boot and reuse. Provides the `emit*` helpers
 * for every event kind the SDK supports. Applies:
 *   * `doNotTrack` / `Sec-CH-Prefers-Reduced-Tracking` honoring
 *   * PII stripping (delegated to batcher)
 *   * ULID generation
 *   * Default fields (workspace_id, deck_id, etc. from context)
 *
 * The client owns the batcher; callers should call `client.start()`
 * once at boot and `client.stop()` on app teardown.
 */

import type {
  AnalyticsConfig,
  AnalyticsContext,
  AnalyticsEvent,
  InteractionEvent,
  InteractionKind,
  PresenterAction,
  PresenterEvent,
  ScrollPauseEvent,
  ScrollProgressEvent,
  ViewEvent,
  LiveSessionEvent,
  LiveEventKind,
  PrivacyMode,
} from './types.js';
import { AnalyticsDroppedEventError } from './types.js';
import { Batcher } from './batcher.js';
import { FetchTransport, InMemoryTransport } from './transport.js';
import { MemoryQueueStore, IdbQueueStore } from './queue.js';
import { stripEvent } from './pii.js';

export interface ClientOptions extends AnalyticsConfig {
  context: AnalyticsContext;
}

export interface ClientOptionsInternal extends ClientOptions {
  /** Test-only override for the DNT detection. */
  detectDnt?: () => boolean;
}

const DEFAULT_ULID_LEN = 26;
const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Crockford-base32 ULID. Deterministic when a `random` source is
 * injected (tests rely on this).
 */
export function ulid(random: () => number = Math.random, now: () => number = Date.now): string {
  const ts = now();
  let time = '';
  let t = ts;
  for (let i = 9; i >= 0; i--) {
    const mod = t % 32;
    time = ULID_ALPHABET[mod]! + time;
    t = Math.floor(t / 32);
  }
  let rand = '';
  for (let i = 0; i < 16; i++) {
    rand += ULID_ALPHABET[Math.floor(random() * 32)]!;
  }
  return time + rand;
}

export class AnalyticsClient {
  private readonly batcher: Batcher;
  private readonly opts: ClientOptionsInternal;
  private readonly detectDnt: () => boolean;
  private closed = false;

  constructor(opts: ClientOptions) {
    this.opts = opts;
    this.detectDnt = opts.detectDnt ?? defaultDntDetector;
    const queue = opts.queueStore ?? defaultQueueStore(opts);
    const transport = opts.transport ?? defaultTransport(opts);
    this.batcher = new Batcher({
      ...opts,
      context: opts.context,
      transport,
      queue,
    });
  }

  start(): void {
    this.batcher.start();
  }

  async stop(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.batcher.stop();
  }

  /** Synchronous enqueue. Returns false when the event was dropped (DNT). */
  emitView(
    input: Omit<
      ViewEvent,
      | 'event_id'
      | 'event_name'
      | 'schema_version'
      | 'ts_ms'
      | 'ingest_topic'
      | 'source_app'
      | 'privacy_mode'
      | 'device_class'
    > &
      Partial<Pick<ViewEvent, 'privacy_mode' | 'device_class'>>,
  ): boolean {
    return this.emit({
      ...input,
      event_name: 'view',
    } as ViewEvent);
  }

  emitInteraction(
    input: Omit<
      InteractionEvent,
      | 'event_id'
      | 'event_name'
      | 'schema_version'
      | 'ts_ms'
      | 'ingest_topic'
      | 'source_app'
      | 'privacy_mode'
      | 'device_class'
      | 'interaction_kind'
    > & {
      interaction_kind: InteractionKind;
      privacy_mode?: PrivacyMode;
      device_class?: ViewEvent['device_class'];
    },
  ): boolean {
    return this.emit({
      ...input,
      event_name: 'interaction',
    } as InteractionEvent);
  }

  emitScrollProgress(
    input: Omit<
      ScrollProgressEvent,
      | 'event_id'
      | 'event_name'
      | 'schema_version'
      | 'ts_ms'
      | 'ingest_topic'
      | 'source_app'
      | 'privacy_mode'
      | 'device_class'
    >,
  ): boolean {
    return this.emit({ ...input, event_name: 'scroll_progress' } as ScrollProgressEvent);
  }

  emitScrollPause(
    input: Omit<
      ScrollPauseEvent,
      | 'event_id'
      | 'event_name'
      | 'schema_version'
      | 'ts_ms'
      | 'ingest_topic'
      | 'source_app'
      | 'privacy_mode'
      | 'device_class'
    >,
  ): boolean {
    return this.emit({ ...input, event_name: 'scroll_pause' } as ScrollPauseEvent);
  }

  emitPresenterEvent(
    input: Omit<
      PresenterEvent,
      | 'event_id'
      | 'event_name'
      | 'schema_version'
      | 'ts_ms'
      | 'ingest_topic'
      | 'source_app'
      | 'action'
    > & { action: PresenterAction },
  ): boolean {
    return this.emit({ ...input, event_name: 'presenter_event' } as PresenterEvent);
  }

  emitLiveSessionEvent(
    input: Omit<
      LiveSessionEvent,
      'event_id' | 'event_name' | 'schema_version' | 'ts_ms' | 'ingest_topic' | 'live_event_kind'
    > & { live_event_kind: LiveEventKind },
  ): boolean {
    return this.emit({ ...input, event_name: 'live_session_event' } as LiveSessionEvent);
  }

  /** Test-only: build the signed body for a batch. */
  buildSignedBody(events: readonly AnalyticsEvent[]) {
    return this.batcher.buildSignedBody(events);
  }

  /** Test-only: force a flush. */
  async flush(): Promise<void> {
    await this.batcher.flush();
  }

  /** Test-only: drop everything. */
  async reset(): Promise<void> {
    await this.batcher.reset();
  }

  private emit(event: AnalyticsEvent): boolean {
    if (this.detectDnt() && (this.opts.honorDnt ?? true)) {
      throw new AnalyticsDroppedEventError('dnt');
    }
    const stamped: AnalyticsEvent = {
      ...stripEvent(event),
      event_id: event.event_id ?? ulid(this.opts.random ?? Math.random, this.opts.now ?? Date.now),
      schema_version: 1,
      ts_ms: event.ts_ms ?? (this.opts.now ?? Date.now)(),
      privacy_mode: event.privacy_mode ?? this.opts.context.privacy_mode,
      device_class: event.device_class ?? this.opts.context.device_class,
      source_app: event.source_app ?? this.opts.context.source_app,
      ingest_topic: 'events.ingest.raw',
    };
    void this.batcher.enqueue(stamped);
    return true;
  }
}

function defaultDntDetector(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & {
    doNotTrack?: string | null;
  };
  if (nav.doNotTrack === '1') return true;
  // Sec-CH-Prefers-Reduced-Tracking surfaces via UA client hints; we
  // approximate it with the `userAgentData` API where available.
  const uaData = (nav as Navigator & { userAgentData?: { prefersReducedTracking?: boolean } })
    .userAgentData;
  if (uaData?.prefersReducedTracking) return true;
  return false;
}

function defaultTransport(opts: ClientOptions) {
  if (typeof fetch === 'undefined') {
    return new InMemoryTransport();
  }
  return new FetchTransport({ ingestUrl: opts.ingestUrl, hmacKeyHex: opts.hmacKeyHex });
}

function defaultQueueStore(opts: ClientOptions) {
  try {
    if (typeof indexedDB !== 'undefined') return new IdbQueueStore();
  } catch {
    /* fall through */
  }
  return new MemoryQueueStore();
}
