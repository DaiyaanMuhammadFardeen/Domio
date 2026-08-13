/**
 * Analytics SDK event types.
 *
 * These mirror the JSON Schemas at contracts/events/ingest/*.json. The
 * SDK is the canonical client for these shapes; services/event-ingest
 * re-validates against the schemas before forwarding to Kafka.
 *
 * Wire format: snake_case fields, ISO timestamps as ms-since-epoch
 * integers (`ts_ms`), privacy_mode always set so ingest can enforce
 * consent gates without a join.
 */

export type PrivacyMode = 'identified' | 'pseudonymous' | 'anon_consent' | 'anon_no_track';

export type DeviceClass = 'mobile' | 'tablet' | 'desktop' | 'bot';

export type SourceApp = 'viewer' | 'presenter' | 'join-web' | 'rtgw' | 'pwg';

export type RegionPin = 'global' | 'bd';

/**
 * Common fields shared by every event. The SDK fills these from the
 * client context (workspace_id, viewer_id_key, device_class, etc.) so
 * callers don't have to thread them through every helper.
 */
export interface AnalyticsEventBase {
  event_id: string;
  event_name: string;
  schema_version: 1;
  ts_ms: number;
  workspace_id: string;
  deck_id: string;
  slide_id?: string;
  scene_node_id?: string;
  viewer_id_key: string;
  session_id?: string;
  experiment_id?: string;
  variant_id?: string;
  privacy_mode: PrivacyMode;
  device_class: DeviceClass;
  ua_family?: string;
  os_family?: string;
  referer_host?: string;
  country_iso?: string;
  region_pinned?: RegionPin;
  share_link_id?: string;
  source_app: SourceApp;
  ingest_topic: 'events.ingest.raw';
  forward_compat?: boolean;
}

/**
 * View event — emitted when a viewer lands on a slide.
 * Drives feature #169 (per-viewer, per-slide analytics).
 */
export interface ViewEvent extends AnalyticsEventBase {
  event_name: 'view';
}

/**
 * Interaction event — emitted when the viewer clicks / types / votes.
 * Drives #170 (interactive element analytics) + #177 (funnel step).
 */
export interface InteractionEvent extends AnalyticsEventBase {
  event_name: 'interaction';
  interaction_kind: InteractionKind;
  interaction_data?: string; // JSON-encoded payload
  value_numeric?: number;
  value_text?: string;
}

export type InteractionKind =
  | 'poll_vote'
  | 'roi_calc_input'
  | 'hotspot_click'
  | 'branching_choice'
  | 'form_field'
  | 'scenario_toggle'
  | 'qa_item'
  | 'quiz_attempt'
  | 'reaction'
  | 'nav_vote'
  | 'sentiment_input'
  | 'raise_hand'
  | 'feedback_response'
  | 'cta_click'
  | 'share'
  | 'download';

/**
 * Scroll progress event — emitted at most every 250ms while scrolling.
 * Drives W5 heatmap (#171).
 */
export interface ScrollProgressEvent extends AnalyticsEventBase {
  event_name: 'scroll_progress';
  dwell_ms: number;
  scroll_depth: number; // [0, 1]
  tile_x: number; // [0, 63]
  tile_y: number; // [0, 31]
  viewport_height_px: number;
  scroll_velocity_px_per_s?: number;
}

/**
 * Scroll pause event — emitted when scroll stalls >=750ms.
 * Primary attention signal for W5.
 */
export interface ScrollPauseEvent extends AnalyticsEventBase {
  event_name: 'scroll_pause';
  dwell_ms: number;
  tile_x: number;
  tile_y: number;
  viewport_height_px: number;
  scroll_depth?: number;
}

/**
 * Presenter event — emitted by apps/presenter for presenter-mode actions.
 * Drives W10 live analytics.
 */
export interface PresenterEvent extends AnalyticsEventBase {
  event_name: 'presenter_event';
  source_app: 'presenter';
  presenter_user_id: string;
  action: PresenterAction;
  action_data?: string;
  co_presenter_user_id?: string;
  annotation_id?: string;
}

export type PresenterAction =
  | 'slide_advance'
  | 'slide_regress'
  | 'slide_jump'
  | 'mode_change'
  | 'hud_open'
  | 'hud_close'
  | 'private_note'
  | 'spotlight_on'
  | 'spotlight_off'
  | 'whiteboard_clear'
  | 'annotation_create'
  | 'annotation_delete'
  | 'session_start'
  | 'session_pause'
  | 'session_resume'
  | 'session_end'
  | 'co_presenter_invite'
  | 'co_presenter_kick';

/**
 * Live session event — re-emitted by rtgw / pwg after fan-out.
 */
export interface LiveSessionEvent extends AnalyticsEventBase {
  event_name: 'live_session_event';
  source_app: 'rtgw' | 'pwg' | 'presenter' | 'viewer' | 'join-web';
  live_event_kind: LiveEventKind;
  live_event_data?: string;
  payload_size_bytes?: number;
  latency_ms?: number;
}

export type LiveEventKind =
  | 'crdt_state_apply'
  | 'crdt_branch_create'
  | 'crdt_remote_update'
  | 'attendance_join'
  | 'attendance_leave'
  | 'attendance_hybrid_mark'
  | 'poll_open'
  | 'poll_close'
  | 'poll_vote'
  | 'qa_submit'
  | 'qa_upvote'
  | 'quiz_open'
  | 'quiz_close'
  | 'quiz_attempt'
  | 'reaction_burst'
  | 'reaction_storm'
  | 'nav_vote_open'
  | 'nav_vote_cast'
  | 'nav_vote_close'
  | 'sentiment_sample'
  | 'raise_hand'
  | 'raise_hand_drop'
  | 'feedback_open'
  | 'feedback_response';

export type AnalyticsEvent =
  | ViewEvent
  | InteractionEvent
  | ScrollProgressEvent
  | ScrollPauseEvent
  | PresenterEvent
  | LiveSessionEvent;

/**
 * The SDK's pre-flight context. Constructed once per app boot and
 * passed to every emit* helper. The transport / queue read this to
 * stamp partition keys + headers.
 */
export interface AnalyticsContext {
  workspace_id: string;
  deck_id: string;
  viewer_id_key: string;
  session_id?: string;
  share_link_id?: string;
  experiment_id?: string;
  variant_id?: string;
  privacy_mode: PrivacyMode;
  source_app: SourceApp;
  device_class: DeviceClass;
  ua_family?: string;
  os_family?: string;
  referer_host?: string;
  country_iso?: string;
  region_pinned?: RegionPin;
}

export interface AnalyticsConfig {
  ingestUrl: string;
  hmacKeyHex: string;
  /** Maximum events per POST batch. Default 50. */
  maxBatchSize?: number;
  /** Maximum bytes per POST batch (1-5 KB target). Default 5 * 1024. */
  maxBatchBytes?: number;
  /** Flush on a fixed cadence; default 2000 ms. */
  flushIntervalMs?: number;
  /**
   * Honor Do-Not-Track and Sec-CH-Prefers-Reduced-Tracking. Default
   * true. When true, the SDK drops every event from a DNT=1 client
   * rather than queuing it.
   */
  honorDnt?: boolean;
  /** Override transport (default: FetchTransport). */
  transport?: AnalyticsTransport;
  /** Override IDB queue (default: IdbQueueStore). Use MemoryQueueStore in tests. */
  queueStore?: QueueStore;
  /** Override the random source for tests. */
  random?: () => number;
  /** Override Date.now for tests. */
  now?: () => number;
}

export interface QueuedEvent {
  /** Stable client-assigned ULID. */
  event_id: string;
  /** Monotonic sequence assigned at queue time. */
  seq: number;
  /** Approximate payload size in bytes (post-PII strip). */
  bytes: number;
  /** The event payload. */
  event: AnalyticsEvent;
  /** Number of events dropped because the queue overflowed before this one. */
  dropped: number;
}

export interface AnalyticsTransport {
  /**
   * POST a batch of events. Implementations must throw AnalyticsTransportError
   * on 5xx so the batcher can retry.
   */
  send(batch: AnalyticsEvent[], ctx: AnalyticsContext): Promise<void>;
}

export interface QueueStore {
  enqueue(record: QueuedEvent): Promise<void>;
  peek(limit: number): Promise<QueuedEvent[]>;
  drop(seqs: readonly number[]): Promise<void>;
  /** Total bytes currently held (approximate). */
  size(): Promise<number>;
  /** Total events currently held. */
  count(): Promise<number>;
}

/** Error thrown by transport on 5xx; the batcher catches this and retries. */
export class AnalyticsTransportError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'AnalyticsTransportError';
  }
}

/** Error thrown when an event is dropped before transmission (DNT, schema). */
export class AnalyticsDroppedEventError extends Error {
  constructor(public readonly reason: 'dnt' | 'schema' | 'pii' | 'consent') {
    super(`event dropped: ${reason}`);
    this.name = 'AnalyticsDroppedEventError';
  }
}
