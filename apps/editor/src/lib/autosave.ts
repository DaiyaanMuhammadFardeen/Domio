/**
 * Editor autosave facade — wraps the SDK's `AutosaveQueue` with an
 * observable status (idle / syncing / synced / offline) suitable for the
 * `SyncIndicator` component.
 *
 * See docs/development_phases/phase-03 §E.4: every committed op is
 * queued; UI subscribes to `subscribe()` for live state changes.
 */

import {
  AutosaveQueue,
  InMemoryPersistentStore,
  type AutosavePayload,
} from '@domio/sdk';

export type AutosaveStatus = 'idle' | 'pending' | 'syncing' | 'synced' | 'offline';

export interface AutosaveState {
  status: AutosaveStatus;
  pending: number;
  lastSyncedAt: number | null;
  lastError: string | null;
}

export interface AutosaveFacade {
  enqueue(id: string, payload: unknown): void;
  flush(): Promise<void>;
  state(): AutosaveState;
  subscribe(listener: (state: AutosaveState) => void): () => void;
}

export function createAutosaveFacade(
  options: { debounceMs?: number; offline?: boolean } = {},
): AutosaveFacade {
  const queue = new AutosaveQueue({
    store: new InMemoryPersistentStore(),
    debounceMs: options.debounceMs ?? 16,
  });

  const listeners = new Set<(state: AutosaveState) => void>();
  let lastSyncedAt: number | null = null;
  let lastError: string | null = null;

  function snapshot(status: AutosaveStatus): AutosaveState {
    return {
      status,
      pending: queue.pendingCount(),
      lastSyncedAt,
      lastError,
    };
  }

  function emit(status: AutosaveStatus): void {
    const state = snapshot(status);
    for (const listener of listeners) listener(state);
  }

  return {
    enqueue(id, payload) {
      queue.enqueue(id, payload);
      emit(options.offline ? 'offline' : 'pending');
    },
    async flush() {
      if (options.offline) {
        emit('offline');
        return;
      }
      emit('syncing');
      try {
        await queue.flush();
        lastSyncedAt = Date.now();
        lastError = null;
        emit(queue.pendingCount() > 0 ? 'pending' : 'synced');
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'autosave failed';
        emit('offline');
      }
    },
    state() {
      return snapshot(options.offline ? 'offline' : queue.pendingCount() > 0 ? 'pending' : 'synced');
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot(options.offline ? 'offline' : 'synced'));
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * Convenience for tests that just want to inspect the underlying queue.
 */
export function getQueueEntries<T>(state: { list(): AutosavePayload<T>[] }): AutosavePayload<T>[] {
  return state.list();
}