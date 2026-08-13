/**
 * ActionExecutor — dispatches actions produced by RuleEvaluator.
 *
 * The executor doesn't know about UI; it dispatches to registered
 * handlers keyed by `ActionKind`. Hosts (editor preview, viewer runtime,
 * presenter) register handlers like `setVariable`, `navigateTo`, etc.
 * Unhandled action kinds throw at dispatch time so misconfiguration is
 * surfaced early.
 */

import type { Action, ActionKind } from './types.js';
import type { VarStore } from './var-store.js';

export type ActionHandler = (params: Readonly<Record<string, unknown>>) => void | Promise<void>;

export class UnknownActionError extends Error {
  constructor(kind: ActionKind) {
    super(`Unknown action kind '${kind}'`);
    this.name = 'UnknownActionError';
  }
}

export class ActionExecutor {
  private readonly handlers = new Map<ActionKind, ActionHandler>();

  register(kind: ActionKind, handler: ActionHandler): void {
    this.handlers.set(kind, handler);
  }

  unregister(kind: ActionKind): void {
    this.handlers.delete(kind);
  }

  async execute(action: Action): Promise<void> {
    const handler = this.handlers.get(action.kind);
    if (!handler) throw new UnknownActionError(action.kind);
    await handler(action.params);
  }

  has(kind: ActionKind): boolean {
    return this.handlers.has(kind);
  }
}

/**
 * Bundle default handlers for the common subset used in editor preview.
 * Hosts can extend / override by calling `register(...)` again.
 */
export function defaultActionHandlers(store: VarStore): Record<ActionKind, ActionHandler> {
  return {
    show: ({ targetId }) => {
      // Element-level visibility is a host concern; emit an event the
      // host listens to via a custom dispatcher.
      dispatchHostEvent('action:show', { targetId });
    },
    hide: ({ targetId }) => dispatchHostEvent('action:hide', { targetId }),
    enable: ({ targetId }) => dispatchHostEvent('action:enable', { targetId }),
    disable: ({ targetId }) => dispatchHostEvent('action:disable', { targetId }),
    set_variable: ({ name, value, scope }) => {
      if (typeof name !== 'string') throw new Error('set_variable: `name` required');
      store.write(name, value, {
        scope: (scope as 'deck' | 'slide' | 'session' | 'viewer' | 'component_instance') ?? 'deck',
      });
    },
    navigate_to: ({ slideId }) => {
      if (typeof slideId !== 'string') throw new Error('navigate_to: `slideId` required');
      dispatchHostEvent('action:navigate_to', { slideId });
    },
    play_animation: ({ animationId }) => {
      if (typeof animationId !== 'string')
        throw new Error('play_animation: `animationId` required');
      dispatchHostEvent('action:play_animation', { animationId });
    },
    submit_form: ({ formId }) => {
      if (typeof formId !== 'string') throw new Error('submit_form: `formId` required');
      dispatchHostEvent('action:submit_form', { formId });
    },
    open_overlay: ({ overlayId }) => {
      if (typeof overlayId !== 'string') throw new Error('open_overlay: `overlayId` required');
      dispatchHostEvent('action:open_overlay', { overlayId });
    },
    close_overlay: ({ overlayId }) => {
      if (typeof overlayId !== 'string') throw new Error('close_overlay: `overlayId` required');
      dispatchHostEvent('action:close_overlay', { overlayId });
    },
  };
}

/** Tiny in-process event bus — replaced by the editor's window-level events in practice. */
const HOST_LISTENERS = new Map<string, Set<(detail: unknown) => void>>();

function dispatchHostEvent(name: string, detail: unknown): void {
  const set = HOST_LISTENERS.get(name);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(detail);
    } catch {
      // ignore
    }
  }
}

export function addHostListener(name: string, fn: (detail: unknown) => void): () => void {
  const set = HOST_LISTENERS.get(name) ?? new Set();
  set.add(fn);
  HOST_LISTENERS.set(name, set);
  return () => {
    const cur = HOST_LISTENERS.get(name);
    if (cur) {
      cur.delete(fn);
      if (cur.size === 0) HOST_LISTENERS.delete(name);
    }
  };
}

/** Test-only helper to clear all listeners between tests. */
export function __clearHostListeners(): void {
  HOST_LISTENERS.clear();
}
