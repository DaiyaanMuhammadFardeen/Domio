/**
 * TransitionEvaluator — selects the highest-precedence input event
 * when several fire on the same animation tick.
 *
 * Precedence ladder (highest first):
 *   focus > press > click > hover > default
 *
 * The evaluator is pure: no `eval`, no dynamic access, no I/O. It
 * consumes only the typed `InteractionEvent` shape below and returns
 * a precedence score. The `StateMachine` class uses this score to
 * resolve ambiguous input.
 */

/** Input events the prototype runtime understands. */
export type InteractionEventKind = 'focus' | 'press' | 'click' | 'hover' | 'default';

export interface InteractionEvent {
  readonly kind: InteractionEventKind;
  readonly at: number;
}

/** Higher value wins when two events fire on the same tick. */
export const EVENT_PRECEDENCE: Readonly<Record<InteractionEventKind, number>> = {
  focus: 50,
  press: 40,
  click: 30,
  hover: 20,
  default: 10,
} as const;

/** Stable ordering used for diagnostics + tests. */
export const PRECEDENCE_LADDER: readonly InteractionEventKind[] = [
  'focus',
  'press',
  'click',
  'hover',
  'default',
] as const;

export class TransitionEvaluator {
  private readonly now: () => number;

  constructor(opts: { readonly now?: () => number } = {}) {
    this.now = opts.now ?? ((): number => Date.now());
  }

  /** Returns the highest-precedence event from `events`. Empty input → `null`. */
  selectWinner(events: readonly InteractionEvent[]): InteractionEvent | null {
    if (events.length === 0) return null;
    let winner: InteractionEvent = events[0]!;
    let winnerScore = EVENT_PRECEDENCE[winner.kind];
    for (let i = 1; i < events.length; i++) {
      const candidate = events[i]!;
      const score = EVENT_PRECEDENCE[candidate.kind];
      if (score > winnerScore) {
        winner = candidate;
        winnerScore = score;
      }
    }
    return { ...winner, at: winner.at ?? this.now() };
  }

  /** Precedence score for a single event kind. Useful for tests + display. */
  precedenceOf(kind: InteractionEventKind): number {
    return EVENT_PRECEDENCE[kind];
  }

  /** All events strictly weaker than `kind`, ordered descending by precedence. */
  weakerThan(kind: InteractionEventKind): readonly InteractionEventKind[] {
    const out: InteractionEventKind[] = [];
    const top = EVENT_PRECEDENCE[kind];
    for (const k of PRECEDENCE_LADDER) {
      if (EVENT_PRECEDENCE[k] < top) out.push(k);
    }
    return out;
  }
}
