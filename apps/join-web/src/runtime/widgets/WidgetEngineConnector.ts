/**
 * @domio/join-web — widget engine connector.
 *
 * Subscribes to a single widget id on the WS bus and exposes its
 * current state to React via `useWidgetState`. The connector is
 * decoupled from the WS client implementation so it can be mocked
 * in tests.
 *
 * The bus is an in-memory subject: publishers push envelope-shaped
 * frames in, subscribers get only the ones addressed to their
 * widgetId. This is intentionally minimal — it will be wired to the
 * real `connect()` from `runtime/ws-client.ts` in W4-W8 as the
 * engine surface lands.
 */

'use client';

import { useSyncExternalStore } from 'react';
import type { AudienceEnvelope } from '@domio/protocol';

export interface WidgetSnapshot {
  /** Last envelope frame addressed to this widget, if any. */
  readonly lastMessage: AudienceEnvelope | null;
  /** Engine-reported state for this widget (counts, words, etc.). */
  readonly state: unknown;
  /** Last error envelope, if any. */
  readonly error: string | null;
}

interface WidgetBus {
  subscribe(widgetId: string, fn: (snap: WidgetSnapshot) => void): () => void;
  publish(widgetId: string, frame: AudienceEnvelope): void;
  getSnapshot(widgetId: string): WidgetSnapshot;
}

const EMPTY_SNAPSHOT: WidgetSnapshot = {
  lastMessage: null,
  state: null,
  error: null,
};

function createBus(): WidgetBus {
  const snapshots = new Map<string, WidgetSnapshot>();
  const listeners = new Map<string, Set<(snap: WidgetSnapshot) => void>>();
  return {
    subscribe(widgetId, fn) {
      let set = listeners.get(widgetId);
      if (!set) {
        set = new Set();
        listeners.set(widgetId, set);
      }
      set.add(fn);
      return () => {
        const s = listeners.get(widgetId);
        if (!s) return;
        s.delete(fn);
        if (s.size === 0) listeners.delete(widgetId);
      };
    },
    publish(widgetId, frame) {
      const prev = snapshots.get(widgetId) ?? EMPTY_SNAPSHOT;
      let next: WidgetSnapshot = { ...prev, lastMessage: frame };
      if (frame.kind === 'error') {
        const msg = (frame as AudienceEnvelope & { message?: string }).message;
        next = { ...next, error: msg ?? 'engine error' };
      } else {
        next = { ...next, error: null };
        // Update the engine-state slot with the raw frame payload so
        // widgets can read counts, words, votes, etc. The widget is
        // responsible for interpreting the frame shape.
        next = { ...next, state: frame };
      }
      snapshots.set(widgetId, next);
      const subs = listeners.get(widgetId);
      if (subs) for (const fn of subs) fn(next);
    },
    getSnapshot(widgetId) {
      return snapshots.get(widgetId) ?? EMPTY_SNAPSHOT;
    },
  };
}

const globalAny = globalThis as unknown as { __domioWidgetBus?: WidgetBus };
function bus(): WidgetBus {
  if (!globalAny.__domioWidgetBus) {
    globalAny.__domioWidgetBus = createBus();
  }
  return globalAny.__domioWidgetBus;
}

/**
 * Subscribe to a widget id. Returns the current snapshot and a
 * stable React re-render trigger when the snapshot changes.
 */
export function useWidgetState(widgetId: string): WidgetSnapshot {
  const subscribe = (cb: () => void): (() => void) => bus().subscribe(widgetId, () => cb());
  const getSnap = (): WidgetSnapshot => bus().getSnapshot(widgetId);
  return useSyncExternalStore(subscribe, getSnap, getSnap);
}

/** Push a frame into the bus — used by the WS client and tests. */
export function pushWidgetFrame(widgetId: string, frame: AudienceEnvelope): void {
  bus().publish(widgetId, frame);
}

/** Reset the bus — tests only. */
export function _resetWidgetBusForTests(): void {
  globalAny.__domioWidgetBus = createBus();
}

/**
 * Optional: connect a `WidgetEngineConnector` to a running WS client.
 * The WS client streams audience envelopes; we filter frames whose
 * `widget_id` matches and push them into the bus. This is a thin
 * adapter so the bus can be tested without a real socket.
 */
export interface WidgetEngineConnector {
  disconnect(): void;
}

export interface WidgetEngineConnectorOptions {
  readonly subscribe: (cb: (frame: AudienceEnvelope) => void) => () => void;
}

export function connectWidgetEngine(opts: WidgetEngineConnectorOptions): WidgetEngineConnector {
  const unsubscribe = opts.subscribe((frame) => {
    const widgetId = (frame as AudienceEnvelope & { widget_id?: string }).widget_id;
    if (!widgetId) return;
    pushWidgetFrame(widgetId, frame);
  });
  return { disconnect: unsubscribe };
}
