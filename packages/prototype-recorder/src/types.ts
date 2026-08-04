/**
 * Recorder client types (Phase 10 M5).
 *
 * These mirror the server-side wire shape (see
 * `services/prototype-recorder/src/types.ts`). The client doesn't depend
 * on the server package — it's a peer of that surface.
 */

export type ConsentTier = 'opt_in' | 'opt_out' | 'anonymous';

export type Region = 'us-east' | 'us-west' | 'eu-central' | 'ap-south' | 'ap-east';

export type EventType =
  | 'session_start'
  | 'session_end'
  | 'slide_enter'
  | 'slide_exit'
  | 'click'
  | 'hover'
  | 'form_submit'
  | 'calculator_change'
  | 'rage_click'
  | 'error'
  | 'device_frame_change'
  | 'consent_change';

export interface RecorderEvent {
  readonly seq?: number;
  readonly eventType: EventType;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly createdAt: number;
  readonly clientFingerprint: string;
  readonly region: Region;
}

export interface RecorderConfig {
  readonly sessionId: string;
  readonly tenantId: string;
  readonly deckId: string;
  readonly ingestUrl: string;
  /** Client buffer cap; defaults to 5 MB. */
  readonly bufferBytes?: number;
  /** Flush interval in ms; defaults to 5_000. */
  readonly flushIntervalMs?: number;
  /** Override the chunk size for chunked uploads; defaults to 1 MB. */
  readonly chunkBytes?: number;
  /** Optional region pin from the server. When set, mismatching regions abort. */
  readonly regionPinned?: boolean;
  readonly region: Region;
  readonly consent: ConsentTier;
  /** When `true`, the recorder buffers into IndexedDB before send. */
  readonly useIndexedDb?: boolean;
  /** Custom fetch/keepalive path used in tests. */
  readonly fetchImpl?: typeof fetch;
  /** Custom sendBeacon (used in tests). */
  readonly sendBeaconImpl?: (url: string, body: string) => boolean;
}

export interface ReplayEvent extends RecorderEvent {
  readonly id: string;
  readonly sessionId: string;
}

export interface ReplaySnapshot {
  readonly atEvent: number;
  readonly atMs: number;
  readonly variables: Readonly<Record<string, unknown>>;
}

/** Per-cell heat values used by the heatmap aggregator. */
export interface HeatCell {
  /** Cell coordinates inside the canvas viewport (normalized [0..1]). */
  readonly x: number;
  readonly y: number;
  readonly clicks: number;
  /** Sum of time (ms) spent hovering over the cell. */
  readonly dwellMs: number;
  /** Number of slide drops in this region (slider exits before user finishes). */
  readonly slideDrops: number;
}

export interface HeatmapBucket {
  readonly width: number;
  readonly height: number;
  readonly cells: readonly HeatCell[];
}
