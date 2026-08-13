/**
 * Sequences module — Phase 10 M6.2.
 *
 * Public surface:
 *   - `TimelineRuntime` — drives presentation sequences (slides
 *     in order, pause/resume, interruption policies).
 *   - `interruption-policy.ts` — ignore / queue / abort handlers.
 *   - `visibility-listener.ts` — pauses on `document.hidden`,
 *     resumes on visibility.
 */

export {
  TimelineRuntime,
  DEFAULT_INTERVAL_MS,
  DEFAULT_PAUSE_WARN_AT_MS,
} from './timeline-runtime.js';
export type { TimelineRuntimeOptions } from './timeline-runtime.js';
export {
  applyInterruption,
  dequeueInterruption,
  initialInterruptionState,
} from './interruption-policy.js';
export type {
  Interruption,
  InterruptionPolicyName,
  InterruptionPolicyState,
  InterruptionKind,
} from './interruption-policy.js';
export { VisibilityListener } from './visibility-listener.js';
export type { VisibilityListenerOptions, VisibilityLike } from './visibility-listener.js';
