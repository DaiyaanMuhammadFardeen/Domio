/**
 * StateMachine — a small finite-state machine for component instances.
 *
 * Parses the `{ states, transitions, initial }` shape from component
 * metadata and exposes a deterministic transition engine:
 *
 *   - `getCurrentState()` → current state name.
 *   - `transition(event)` → apply an event, returns the new state.
 *   - `reset()` → snap back to `initial`.
 *
 * When several events fire on the same tick, the `TransitionEvaluator`
 * breaks the tie by precedence (`focus > press > click > hover > default`).
 *
 * The machine emits `onTransition` after every successful state change,
 * including the initial transition that happens lazily on `getCurrentState`.
 */

import type { InteractionEvent, InteractionEventKind } from './transition-evaluator.js';
import { TransitionEvaluator, EVENT_PRECEDENCE } from './transition-evaluator.js';
import type { StateTransitionEvent } from './event-bus.js';

export interface StateMachineDef {
  /** Map from state name → state definition. */
  readonly states: Readonly<Record<string, StateDef>>;
  /** All edges, each `{ from, to, event, guard? }`. */
  readonly transitions: readonly StateTransition[];
  /** Name of the initial state. Must be in `states`. */
  readonly initial: string;
}

export interface StateDef {
  /** Optional human-readable label for inspectors. */
  readonly label?: string;
  /** Free-form metadata (animation target, role, etc). */
  readonly meta?: Readonly<Record<string, unknown>>;
}

export interface StateTransition {
  readonly from: string;
  readonly to: string;
  readonly event: InteractionEventKind | string;
  /** Optional guard source text. Evaluated by the runtime's expression
   * compiler at consumer time; the machine itself does not run guards. */
  readonly guard?: string;
}

/** Output shape for `transition(event)` — what the inspector renders. */
export interface StateTransitionResult {
  readonly previous: string;
  readonly current: string;
  readonly event: InteractionEventKind;
  readonly at: number;
  /** True iff this call actually changed the state. */
  readonly changed: boolean;
}

export type StateMachineTransitionHandler = (event: StateTransitionEvent) => void;

export class StateMachine {
  readonly instanceId: string;
  readonly def: StateMachineDef;
  readonly evaluator: TransitionEvaluator;

  private _current: string | null;
  private _previous: string | null = null;
  private onTransition: StateMachineTransitionHandler | null = null;

  constructor(
    instanceId: string,
    def: StateMachineDef,
    opts: {
      readonly evaluator?: TransitionEvaluator;
      readonly now?: () => number;
      readonly onTransition?: StateMachineTransitionHandler;
      /** If set, the machine starts from this state instead of `initial`. */
      readonly currentState?: string;
    } = {},
  ) {
    this.instanceId = instanceId;
    this.validate(def);
    this.def = def;
    this.evaluator =
      opts.evaluator ?? new TransitionEvaluator({ ...(opts.now ? { now: opts.now } : {}) });
    this._current = opts.currentState ?? null;
    if (this.onTransition !== null) {
      // No-op — kept for readability of the explicit assignment below.
    }
    this.onTransition = opts.onTransition ?? null;
  }

  /** Register a transition callback. */
  setOnTransition(handler: StateMachineTransitionHandler | null): void {
    this.onTransition = handler;
  }

  /** Currently-active state. Performs the initial transition on first read. */
  getCurrentState(): string {
    if (this._current === null) {
      this.applyInitial();
    }
    return this._current as string;
  }

  /** Previous state (null until a transition has happened). */
  getPreviousState(): string | null {
    return this._previous;
  }

  /** Apply a single event. Returns the new state and whether it changed. */
  transition(event: InteractionEvent | InteractionEventKind): StateTransitionResult {
    const kind: InteractionEventKind = typeof event === 'string' ? event : event.kind;
    const at = typeof event === 'string' ? Date.now() : (event.at ?? Date.now());
    const previous = this.getCurrentState();
    const next = this.applyEvent(previous, kind);
    const changed = next !== previous;
    if (changed) {
      this._previous = previous;
      this._current = next;
      this.fireTransition({
        instanceId: this.instanceId,
        previous,
        current: next,
        event: kind,
        at: at,
      });
    }
    return { previous, current: next, event: kind, at, changed };
  }

  /**
   * Resolve the highest-precedence event from `events` and apply it.
   * Convenience wrapper for viewers that batch DOM events per tick.
   */
  transitionBatch(events: readonly InteractionEvent[]): StateTransitionResult {
    const winner = this.evaluator.selectWinner(events);
    if (!winner) {
      const cur = this.getCurrentState();
      return { previous: cur, current: cur, event: 'default', at: Date.now(), changed: false };
    }
    return this.transition(winner);
  }

  /** Snap back to `def.initial` (or `currentState` if given). */
  reset(currentState?: string): string {
    const target = currentState ?? this.def.initial;
    const previous = this.getCurrentState();
    this._previous = previous;
    this._current = target;
    if (target !== previous) {
      this.fireTransition({
        instanceId: this.instanceId,
        previous,
        current: target,
        event: 'default',
        at: Date.now(),
      });
    }
    return target;
  }

  /** All states defined by this machine. */
  states(): readonly string[] {
    return Object.keys(this.def.states);
  }

  /** Transitions originating from a given state, sorted by event precedence. */
  transitionsFrom(state: string): readonly StateTransition[] {
    const out = this.def.transitions.filter((t) => t.from === state);
    return [...out].sort((a, b) => {
      const sa = EVENT_PRECEDENCE[a.event as InteractionEventKind] ?? 0;
      const sb = EVENT_PRECEDENCE[b.event as InteractionEventKind] ?? 0;
      return sb - sa;
    });
  }

  /** Compact transition-graph rows: `{ from, event, to }`. */
  graphRows(): ReadonlyArray<{
    readonly from: string;
    readonly event: string;
    readonly to: string;
  }> {
    return this.def.transitions.map((t) => ({ from: t.from, event: t.event, to: t.to }));
  }

  // ── private ───────────────────────────────────────────────────────

  private applyInitial(): void {
    const target = this.def.initial;
    if (!this.def.states[target]) {
      throw new Error(`StateMachine(${this.instanceId}): initial state "${target}" not in states`);
    }
    this._previous = null;
    this._current = target;
    this.fireTransition({
      instanceId: this.instanceId,
      previous: '',
      current: target,
      event: 'default',
      at: Date.now(),
    });
  }

  private applyEvent(current: string, kind: InteractionEventKind): string {
    const matches = this.def.transitions.filter((t) => t.from === current && t.event === kind);
    if (matches.length === 0) {
      // No matching transition — fall back to `default` event. If that also
      // doesn't match, stay put.
      if (kind !== 'default') {
        const fallback = this.def.transitions.find(
          (t) => t.from === current && t.event === 'default',
        );
        if (fallback) return fallback.to;
      }
      return current;
    }
    // If multiple transitions match (eventual-consistency style),
    // pick the highest-precedence target by `to` ordering — but all
    // candidates here have the same event, so prefer the first declared.
    const head = matches[0]!;
    if (!this.def.states[head.to]) {
      // Deleted / corrupt target — fall back to default event.
      if (kind !== 'default') {
        const fallback = this.def.transitions.find(
          (t) => t.from === current && t.event === 'default',
        );
        if (fallback && this.def.states[fallback.to]) return fallback.to;
      }
      return current;
    }
    return head.to;
  }

  private fireTransition(event: StateTransitionEvent): void {
    if (!this.onTransition) return;
    try {
      this.onTransition(event);
    } catch {
      // Listeners must not throw — silently swallow.
    }
  }

  private validate(def: StateMachineDef): void {
    if (!def.states || typeof def.states !== 'object') {
      throw new Error('StateMachine: `states` must be an object');
    }
    const names = Object.keys(def.states);
    if (names.length === 0) {
      throw new Error('StateMachine: `states` must contain at least one state');
    }
    if (!def.initial) {
      throw new Error('StateMachine: `initial` is required');
    }
    if (!def.states[def.initial]) {
      throw new Error(
        `StateMachine: initial state "${def.initial}" not in states (${names.join(', ')})`,
      );
    }
    if (!Array.isArray(def.transitions)) {
      throw new Error('StateMachine: `transitions` must be an array');
    }
    for (const t of def.transitions) {
      if (!def.states[t.from]) {
        throw new Error(`StateMachine: transition from "${t.from}" references unknown state`);
      }
      if (!def.states[t.to]) {
        throw new Error(`StateMachine: transition to "${t.to}" references unknown state`);
      }
      if (typeof t.event !== 'string' || t.event.length === 0) {
        throw new Error('StateMachine: transition `event` must be a non-empty string');
      }
    }
  }
}
