/**
 * @domio/recording-orchestrator — observability metrics.
 *
 * Prometheus counters/histograms exported from the orchestrator. Mirrors
 * the pattern in services/presenter-session/src/observability/metrics.ts
 * (stubbed here for v1; production wires to @domio/observability).
 */

export interface MetricsEmitter {
  inc(name: string, labels?: Record<string, string>): void;
  observe(name: string, value: number, labels?: Record<string, string>): void;
}

export class NoopMetricsEmitter implements MetricsEmitter {
  inc(_name: string, _labels?: Record<string, string>): void {}
  observe(_name: string, _value: number, _labels?: Record<string, string>): void {}
}

export const METRIC_STARTED = 'recording_orchestrator_started_total';
export const METRIC_PAUSED = 'recording_orchestrator_paused_total';
export const METRIC_RESUMED = 'recording_orchestrator_resumed_total';
export const METRIC_STOPPED = 'recording_orchestrator_stopped_total';
export const METRIC_FINALIZED = 'recording_orchestrator_finalized_total';
export const METRIC_FAILED = 'recording_orchestrator_failed_total';
export const METRIC_CHUNK_COMMITTED = 'recording_orchestrator_chunk_committed_total';
export const METRIC_CHUNK_CONFLICT = 'recording_orchestrator_chunk_conflict_total';
export const METRIC_CHUNK_DURATION_MS = 'recording_orchestrator_chunk_commit_duration_ms';