/**
 * VarStore — typed, scoped, reactive variable store.
 *
 * Scope ladder (low → high): viewer, session, component_instance, slide,
 * deck. A read resolves through the ladder: `read($name)` first looks at
 * `viewer`, then `session`, etc., and returns the first hit.
 *
 * Change detection: `Object.is` comparison — unchanged writes do not
 * notify subscribers. This matches the spec §M2.3 acceptance criterion.
 *
 * Writes are immutable per-scope: `write()` replaces the value in a
 * scope, never mutates a previous snapshot. This makes the snapshot /
 * restore API safe.
 */

import type { Variable, VariableScope, VarSnapshot } from './types.js';

type ScopeMap = Map<string, unknown>;

export type VarChangeListener = (event: VarChangeEvent) => void;

export interface VarChangeEvent {
  readonly name: string;
  readonly scope: VariableScope;
  readonly previous: unknown;
  readonly next: unknown;
}

export interface VarWriteOptions {
  readonly scope: VariableScope;
  readonly actorId?: string;
  /** Skip notification — used by `restore()` for bulk hydration. */
  readonly silent?: boolean;
}

export interface VarReadOptions {
  readonly scope?: VariableScope;
  /** If set, only this scope is consulted (no ladder traversal). */
  readonly exactScope?: VariableScope;
}

export class VarStore {
  private readonly scopes: Map<VariableScope, ScopeMap> = new Map([
    ['deck', new Map()],
    ['slide', new Map()],
    ['component_instance', new Map()],
    ['session', new Map()],
    ['viewer', new Map()],
  ]);

  private readonly listeners: Map<string, Set<VarChangeListener>> = new Map();
  private readonly wildcardListeners: Set<VarChangeListener> = new Set();

  /** Hydrate a scope with name → value defaults (e.g., on deck open). */
  hydrate(scope: VariableScope, values: Readonly<Record<string, unknown>>): void {
    const map = this.requireScope(scope);
    for (const [name, value] of Object.entries(values)) map.set(name.toUpperCase(), value);
  }

  /** Clear all scopes. */
  reset(): void {
    for (const m of this.scopes.values()) m.clear();
    this.notifyWildcard({ name: '*', scope: 'deck', previous: undefined, next: undefined });
  }

  /**
   * Read a variable by name. If `opts.exactScope` is set, only that scope
   * is consulted. Otherwise the scope ladder is walked and the first hit
   * wins (lower-numbered scopes in `SCOPE_ORDER`).
   */
  read(name: string, opts: VarReadOptions = {}): unknown {
    const key = name.toUpperCase();
    if (opts.exactScope) {
      return this.requireScope(opts.exactScope).get(key) ?? null;
    }
    const order = scopeLadder(opts.scope);
    for (const scope of order) {
      const v = this.requireScope(scope).get(key);
      if (v !== undefined) return v;
    }
    return null;
  }

  /** Read a variable, returning `undefined` if not set anywhere. */
  has(name: string): boolean {
    const key = name.toUpperCase();
    for (const m of this.scopes.values()) {
      if (m.has(key)) return true;
    }
    return false;
  }

  /**
   * Write a value. Returns `true` if the value changed (and subscribers
   * were notified), `false` if `Object.is` matched the previous value.
   */
  write(name: string, value: unknown, opts: VarWriteOptions): boolean {
    const key = name.toUpperCase();
    const map = this.requireScope(opts.scope);
    const raw = map.get(key);
    const previous = raw === undefined ? null : raw;
    if (Object.is(previous, value)) return false;
    map.set(key, value);
    if (!opts.silent) {
      const event: VarChangeEvent = { name: key, scope: opts.scope, previous, next: value };
      this.notifyKey(key, event);
      this.notifyWildcard(event);
    }
    return true;
  }

  /** Subscribe to changes on a specific variable. */
  subscribe(name: string, fn: VarChangeListener): () => void {
    const key = name.toUpperCase();
    const set = this.listeners.get(key) ?? new Set();
    set.add(fn);
    this.listeners.set(key, set);
    return () => {
      const cur = this.listeners.get(key);
      if (cur) {
        cur.delete(fn);
        if (cur.size === 0) this.listeners.delete(key);
      }
    };
  }

  /** Subscribe to every change (used by the bindings DAG). */
  subscribeAll(fn: VarChangeListener): () => void {
    this.wildcardListeners.add(fn);
    return () => this.wildcardListeners.delete(fn);
  }

  /** Snapshot a single scope. */
  snapshot(scope: VariableScope): VarSnapshot {
    const map = this.requireScope(scope);
    const values: Record<string, unknown> = {};
    for (const [k, v] of map.entries()) values[k] = v;
    return { deckId: '', scope, values, takenAt: Date.now() };
  }

  /** Restore a single scope; `silent` prevents notification storms. */
  restore(snap: VarSnapshot, silent = true): void {
    const map = this.requireScope(snap.scope);
    map.clear();
    for (const [k, v] of Object.entries(snap.values)) map.set(k, v);
    if (!silent) {
      this.notifyWildcard({ name: '*', scope: snap.scope, previous: undefined, next: undefined });
    }
  }

  /** List names defined in a scope. */
  namesInScope(scope: VariableScope): string[] {
    return Array.from(this.requireScope(scope).keys());
  }

  /** Get all known variable names across all scopes. */
  allNames(): string[] {
    const set = new Set<string>();
    for (const m of this.scopes.values()) for (const k of m.keys()) set.add(k);
    return Array.from(set);
  }

  /** Author a Variable record into the appropriate scope (with default). */
  define(def: Variable): void {
    this.write(def.name, def.defaultValue, { scope: def.scope, silent: true });
  }

  private requireScope(scope: VariableScope): ScopeMap {
    const m = this.scopes.get(scope);
    if (!m) throw new Error(`Unknown scope '${scope}'`);
    return m;
  }

  private notifyKey(key: string, event: VarChangeEvent): void {
    const set = this.listeners.get(key);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(event);
      } catch {
        // Listeners must not throw — silently swallow.
      }
    }
  }

  private notifyWildcard(event: VarChangeEvent): void {
    for (const fn of this.wildcardListeners) {
      try {
        fn(event);
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Resolve the scope ladder for a read, in priority order (most-specific
 * scope first).
 */
export function scopeLadder(scope?: VariableScope): readonly VariableScope[] {
  // SCOPE_ORDER = ['viewer', 'session', 'component_instance', 'slide', 'deck']
  if (!scope) {
    return ['viewer', 'session', 'component_instance', 'slide', 'deck'];
  }
  // If caller specified a scope, only walk from that scope up to deck.
  const start = ['viewer', 'session', 'component_instance', 'slide', 'deck'].indexOf(scope);
  if (start < 0) return ['viewer', 'session', 'component_instance', 'slide', 'deck'];
  return ['viewer', 'session', 'component_instance', 'slide', 'deck'].slice(
    start,
  ) as readonly VariableScope[];
}
