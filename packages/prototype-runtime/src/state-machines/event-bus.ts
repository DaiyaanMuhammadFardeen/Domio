/**
 * EventBus — broadcasts state-transition events from a `StateMachine`
 * to subscribers (VarStore bridges, debug overlays, animations).
 *
 * The bus is pure: no `eval`, no dynamic access. It only retains
 * the current `current` and `previous` state so late subscribers
 * can read the latest value.
 *
 * Usage:
 *   const bus = new EventBus();
 *   bus.onTransition((evt) => { ... });
 *   machine.onTransition = bus.handler;
 */

import type { InteractionEventKind } from './transition-evaluator.js';

export interface StateTransitionEvent {
  readonly instanceId: string;
  readonly previous: string;
  readonly current: string;
  readonly event: InteractionEventKind;
  readonly at: number;
}

export type StateTransitionHandler = (event: StateTransitionEvent) => void;

export class EventBus {
  private handlers = new Set<StateTransitionHandler>();
  private last: StateTransitionEvent | null = null;
  private readonly boundHandler: StateTransitionHandler;

  constructor() {
    this.boundHandler = (event) => this.emit(event);
  }

  /** Register a handler. Returns an unsubscribe function. */
  onTransition(handler: StateTransitionHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /** Adapter that the `StateMachine.onTransition` callback uses. */
  get handler(): StateTransitionHandler {
    return this.boundHandler;
  }

  /** Broadcast a transition. Catches handler errors so one bad listener
   * does not block the others. */
  emit(event: StateTransitionEvent): void {
    this.last = event;
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch {
        // Listeners must not throw — silently swallow.
      }
    }
  }

  /** Snapshot of the last broadcast (or null). Useful for inspectors. */
  lastEvent(): StateTransitionEvent | null {
    return this.last;
  }

  /** Number of registered handlers. */
  size(): number {
    return this.handlers.size;
  }

  /** Drop all handlers + cached state. */
  clear(): void {
    this.handlers.clear();
    this.last = null;
  }
}
