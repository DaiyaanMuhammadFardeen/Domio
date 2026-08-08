/**
 * Live-analytics — barrel exports (Phase 17 W10).
 */

export { buildApp, type LiveAppDeps } from './server.js';
export { buildOrchestrator, type Orchestrator, type OrchestratorDeps } from './orchestrator.js';
export {
  buildClickHouseClient,
  buildInMemoryClickHouseClient,
  ClickHouseError,
  type ClickHouseClient,
  type InMemoryClickHouseClient,
} from './store/clickhouse.js';
export {
  buildRingBuffer,
  type RingBuffer,
} from './store/ring_buffer.js';
export {
  buildNatsSubscriber,
  buildInMemoryNatsSubscriber,
  normalizeLiveEvent,
  NATS_LIVE_SUBJECT,
  type NatsSubscriber,
  type InMemoryNatsSubscriber,
} from './nats/subscriber.js';
export {
  buildHub,
  type Hub,
  type SubscriberId,
} from './ws/hub.js';
export { attachWebSocket } from './routes/ws.js';
export { liveRoutes, type LiveRoutesDeps } from './routes/live.js';
export { buildSummarySink, type SummarySink } from './summary/sink.js';
export { derivePulse, deriveSummary, type DerivedSummary } from './pulse/derive.js';
export type {
  LiveEvent,
  LiveEventKind,
  LivePulse,
  LiveSessionSummary,
  LiveAnalyticsConfig,
} from './types.js';
export { loadConfigFromEnv } from './types.js';