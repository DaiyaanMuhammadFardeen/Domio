/**
 * InterruptionPolicy — three handlers for slide-sequence interruptions.
 *
 * Spec M6.2 §3.4.2:
 *   - `ignore` — interruptions are dropped on the floor; the sequence
 *     continues regardless of user input.
 *   - `queue` — interruptions are queued in FIFO order and replayed
 *     after the current slide's interval completes.
 *   - `abort` — the first interruption aborts the sequence.
 */

export type InterruptionKind = 'click' | 'tap' | 'hotspot' | 'gesture' | 'external';

export interface Interruption {
  readonly kind: InterruptionKind;
  readonly slideId: string;
  readonly at: number;
}

export type InterruptionPolicyName = 'ignore' | 'queue' | 'abort';

export interface InterruptionPolicyState {
  readonly policy: InterruptionPolicyName;
  readonly queue: readonly Interruption[];
  readonly aborted: boolean;
  readonly ignoredCount: number;
  readonly processedCount: number;
}

/**
 * Apply a new interruption to the state under a given policy.
 * Returns the next state. Pure: does not mutate the input.
 */
export function applyInterruption(
  state: InterruptionPolicyState,
  interruption: Interruption,
): InterruptionPolicyState {
  switch (state.policy) {
    case 'ignore':
      return { ...state, ignoredCount: state.ignoredCount + 1 };
    case 'queue':
      return { ...state, queue: [...state.queue, interruption] };
    case 'abort':
      return {
        ...state,
        aborted: true,
        queue: [...state.queue, interruption],
      };
    default: {
      const _exhaustive: never = state.policy;
      void _exhaustive;
      return state;
    }
  }
}

/** Drain the next interruption off the queue (or null). */
export function dequeueInterruption(state: InterruptionPolicyState): {
  state: InterruptionPolicyState;
  next: Interruption | null;
} {
  if (state.queue.length === 0) return { state, next: null };
  const next = state.queue[0]!;
  return {
    state: { ...state, queue: state.queue.slice(1), processedCount: state.processedCount + 1 },
    next,
  };
}

export function initialInterruptionState(policy: InterruptionPolicyName): InterruptionPolicyState {
  return { policy, queue: [], aborted: false, ignoredCount: 0, processedCount: 0 };
}
