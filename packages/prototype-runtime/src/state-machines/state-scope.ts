/**
 * StateScope — manages state persistence across session / slide / deck
 * / persistent_session scopes.
 *
 *   - `session` — per-session, wiped on deck close.
 *   - `slide` — per-slide, reset on slide-enter unless `persist_instance_state`.
 *   - `deck` — persists for the lifetime of the deck open.
 *   - `persistent_session` — survives across sessions (deep links).
 *
 * The scope keeps an in-memory map keyed by `(scope, instanceId)` and
 * offers `snapshot`, `restore`, `resetOnSlideEnter`. It is pure — no I/O.
 *
 * Wiring the scope to a `StateMachine`:
 *
 *   const scope = new StateScope();
 *   scope.attach(machine);
 *   scope.resetOnSlideEnter(['slide-1', 'slide-2']);
 *   const snap = scope.snapshot('session');
 *   scope.restore(snap);
 */

import type { StateMachine } from './state-machine.js';

export type StatePersistenceScope = 'session' | 'slide' | 'deck' | 'persistent_session';

export const SCOPE_LADDER: readonly StatePersistenceScope[] = [
  'session',
  'slide',
  'deck',
  'persistent_session',
] as const;

export interface StateScopeRecord {
  readonly instanceId: string;
  readonly state: string;
  readonly scope: StatePersistenceScope;
  readonly persistInstanceState: boolean;
  readonly at: number;
}

export interface StateScopeSnapshot {
  readonly scope: StatePersistenceScope;
  readonly takenAt: number;
  readonly records: readonly StateScopeRecord[];
}

interface BoundMachine {
  readonly machine: StateMachine;
  persistInstanceState: boolean;
  scope: StatePersistenceScope;
}

export class StateScope {
  private readonly machines = new Map<string, BoundMachine>();
  private readonly store = new Map<string, StateScopeRecord>();

  /** Bind a machine so `snapshot`/`restore` track it automatically. */
  attach(
    machine: StateMachine,
    opts: {
      readonly scope: StatePersistenceScope;
      readonly persistInstanceState?: boolean;
    },
  ): () => void {
    this.machines.set(machine.instanceId, {
      machine,
      scope: opts.scope,
      persistInstanceState: opts.persistInstanceState ?? false,
    });
    return () => {
      this.machines.delete(machine.instanceId);
      this.store.delete(this.k(machine.instanceId, opts.scope));
    };
  }

  /** Per-instance `persist_instance_state` toggle. */
  setPersistInstanceState(instanceId: string, value: boolean): void {
    const bound = this.machines.get(instanceId);
    if (!bound) throw new Error(`StateScope: unknown instanceId "${instanceId}"`);
    bound.persistInstanceState = value;
  }

  /** Reset state for every machine whose `scope === 'slide'`, unless
   *  `persist_instance_state` is true. Returns the list of instanceIds
   *  that were reset. */
  resetOnSlideEnter(
    slideMachines: readonly string[] = Array.from(this.machines.keys()),
  ): readonly string[] {
    const reset: string[] = [];
    for (const id of slideMachines) {
      const bound = this.machines.get(id);
      if (!bound) continue;
      if (bound.persistInstanceState) continue;
      if (bound.scope !== 'slide') continue;
      bound.machine.reset();
      this.store.delete(this.k(id, 'slide'));
      reset.push(id);
    }
    return reset;
  }

  /** Snapshot every bound machine in `scope`. */
  snapshot(scope: StatePersistenceScope, at: number = Date.now()): StateScopeSnapshot {
    const records: StateScopeRecord[] = [];
    for (const [id, bound] of this.machines) {
      if (bound.scope !== scope) continue;
      records.push({
        instanceId: id,
        state: bound.machine.getCurrentState(),
        scope,
        persistInstanceState: bound.persistInstanceState,
        at,
      });
    }
    return { scope, takenAt: at, records };
  }

  /** Restore from a snapshot. Machines not in the snapshot are untouched. */
  restore(snap: StateScopeSnapshot): number {
    let restored = 0;
    for (const rec of snap.records) {
      const bound = this.machines.get(rec.instanceId);
      if (!bound) continue;
      bound.machine.reset(rec.state);
      this.store.set(this.k(rec.instanceId, snap.scope), rec);
      restored++;
    }
    return restored;
  }

  /** Direct accessor: store + return the current state for an instance. */
  recordFor(instanceId: string, scope: StatePersistenceScope): StateScopeRecord | null {
    const bound = this.machines.get(instanceId);
    if (!bound || bound.scope !== scope) return null;
    return {
      instanceId,
      state: bound.machine.getCurrentState(),
      scope,
      persistInstanceState: bound.persistInstanceState,
      at: Date.now(),
    };
  }

  /** Persist a record manually (used by the service bridge). */
  write(rec: StateScopeRecord): void {
    this.store.set(this.k(rec.instanceId, rec.scope), rec);
  }

  /** Read a previously written record. */
  read(instanceId: string, scope: StatePersistenceScope): StateScopeRecord | null {
    return this.store.get(this.k(instanceId, scope)) ?? null;
  }

  /** Drop every record. */
  clear(): void {
    this.store.clear();
  }

  /** Number of bound machines. */
  size(): number {
    return this.machines.size;
  }

  private k(instanceId: string, scope: StatePersistenceScope): string {
    return `${scope}::${instanceId}`;
  }
}
