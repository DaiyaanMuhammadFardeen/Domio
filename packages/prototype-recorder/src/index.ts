/**
 * @domio/prototype-recorder — client-side recorder for Phase 10 M5.
 *
 * Public surface:
 *   - EventRecorder — in-browser orchestrator with sendBeacon fallback
 *     to fetch(keepalive); 5 MB client buffer; 5 s flush interval.
 *   - ChunkedUploadStream — 1 MB chunked upload path for batches.
 *   - IndexedDBQueue — durable offline buffer with 5 MB cap.
 *   - ReplayEngine — loads a session, plays at 1×/2×/4× speed,
 *     seek-to, produces VarStore snapshots.
 *   - HeatmapAggregator — click + dwell + slide-drop aggregation.
 */

export * from './types.js';
export * from './event-recorder.js';
export * from './chunked-upload-stream.js';
export * from './indexed-db-queue.js';
export * from './replay-engine.js';
export * from './heatmap-aggregator.js';
