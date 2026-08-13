/**
 * Sessionization — barrel exports (Phase 17 W4).
 */

export {
  buildSessionEngine,
  deriveSessionId,
  type SessionEngine,
  type RuleConfig,
  type RuleOutput,
  type IngestInput,
} from './engine/rule.js';

export {
  buildPartitionConsumer,
  consumePartition,
  type ConsumerDeps,
  type PartitionConsumerDeps,
  type PartitionConsumeResult,
} from './engine/consumer.js';

export { buildInMemoryStore, type SessionStore } from './store/inmemory.js';
export {
  buildSessionSink,
  type SessionSink,
  type SessionWriterClient,
} from './store/clickhouse.js';

export {
  buildSessionEmitter,
  InMemoryEmitterClient,
  subjectFor,
  type EmitterClient,
  type SessionEmitter,
} from './emitter/emitter.js';

export type { SessionConfig, SessionEvent, SessionRecord, SessionState } from './types.js';
export { loadConfigFromEnv } from './types.js';
