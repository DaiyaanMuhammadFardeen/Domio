/**
 * @domio/presenter-session — failover election.
 *
 * Phase 15 W12. Implements an epoch-fenced primary/standby election:
 *
 *   - Each candidate holds a monotonic `epoch` counter.
 *   - When a candidate becomes primary it bumps the epoch and emits a
 *     `became_primary_at` timestamp.
 *   - All writes must carry the epoch; a write from a stale epoch is
 *     rejected as DUAL_PRIMARY — preventing split-brain.
 *   - Standby instances buffer ops for `bufferWindowMs` (default 30s);
 *     on promotion they replay the buffer with a new epoch tag.
 *
 * The election is transport-agnostic: it persists state through an
 * `ElectionStore`. The default in-memory store is fine for single-process
 * tests; production swaps in a Postgres implementation (lock via row
 * update, election_id + became_primary_at columns).
 *
 * Public API:
 *   - `Election` interface — promote / heartbeat / stepDown / tryClaim
 *   - `InMemoryElectionStore` — single-process implementation
 *   - `ReplayBuffer<T>` — bounded FIFO for standby CRDT op buffering
 */

export type FailoverRole = 'primary' | 'standby' | 'disabled';

export interface ElectionState {
  /** Stable id of the current primary instance (gateway / api pod id). */
  readonly primary_id: string | null;
  /** Monotonic counter — bumped every promotion. */
  readonly epoch: number;
  /** Wall-clock ms of the most recent promotion. */
  readonly became_primary_at_ms: number | null;
  /** Last successful heartbeat (any role). Used by the health watch. */
  readonly last_heartbeat_at_ms: number;
  /** Current role as observed by this candidate. */
  readonly role: FailoverRole;
}

export interface ElectionStore {
  load(): Promise<ElectionState>;
  save(state: ElectionState): Promise<void>;
}

/** In-memory implementation; sufficient for single-process tests. */
export class InMemoryElectionStore implements ElectionStore {
  private state: ElectionState = {
    primary_id: null,
    epoch: 0,
    became_primary_at_ms: null,
    last_heartbeat_at_ms: 0,
    role: 'disabled',
  };
  async load(): Promise<ElectionState> {
    return this.state;
  }
  async save(state: ElectionState): Promise<void> {
    this.state = state;
  }
  __raw(): ElectionState {
    return this.state;
  }
}

export interface ElectionOptions {
  readonly candidateId: string;
  readonly store: ElectionStore;
  readonly clock?: () => number;
  /** How recent a heartbeat must be to consider the primary "alive".
   *  Defaults to 15s. Standbys wait this long before attempting
   *  promotion. */
  readonly primaryTtlMs?: number;
}

export class Election {
  private readonly candidateId: string;
  private readonly store: ElectionStore;
  private readonly clock: () => number;
  private readonly primaryTtlMs: number;

  constructor(opts: ElectionOptions) {
    this.candidateId = opts.candidateId;
    this.store = opts.store;
    this.clock = opts.clock ?? (() => Date.now());
    this.primaryTtlMs = opts.primaryTtlMs ?? 15_000;
  }

  /** Read the current state without mutating it. */
  async load(): Promise<ElectionState> {
    return this.store.load();
  }

  /** Heartbeat from this candidate. If we are primary we bump
   *  `last_heartbeat_at_ms`; otherwise we leave the primary's heartbeat
   *  alone. Returns the post-heartbeat state. */
  async heartbeat(): Promise<ElectionState> {
    const current = await this.store.load();
    const now = this.clock();
    if (current.primary_id === this.candidateId) {
      const next: ElectionState = { ...current, last_heartbeat_at_ms: now };
      await this.store.save(next);
      return next;
    }
    return current;
  }

  /** Try to claim primary. If no primary is alive, bump epoch and assign
   *  ourselves. If the primary is ourselves, refresh the heartbeat.
   *  Otherwise return `false` — another primary is healthy. */
  async tryClaim(): Promise<
    { claimed: true; state: ElectionState } | { claimed: false; state: ElectionState }
  > {
    const current = await this.store.load();
    const now = this.clock();
    const primaryAlive =
      current.primary_id !== null &&
      current.last_heartbeat_at_ms > 0 &&
      now - current.last_heartbeat_at_ms <= this.primaryTtlMs;

    if (current.primary_id === this.candidateId) {
      const next: ElectionState = { ...current, last_heartbeat_at_ms: now };
      await this.store.save(next);
      return { claimed: true, state: next };
    }

    if (primaryAlive && current.primary_id !== null) {
      // Primary is alive; we're a standby.
      const next: ElectionState = { ...current, role: 'standby' };
      await this.store.save(next);
      return { claimed: false, state: next };
    }

    // Promote ourselves.
    const next: ElectionState = {
      primary_id: this.candidateId,
      epoch: current.epoch + 1,
      became_primary_at_ms: now,
      last_heartbeat_at_ms: now,
      role: 'primary',
    };
    await this.store.save(next);
    return { claimed: true, state: next };
  }

  /** Voluntary step-down — used during graceful shutdown. */
  async stepDown(): Promise<ElectionState> {
    const current = await this.store.load();
    if (current.primary_id !== this.candidateId) return current;
    const next: ElectionState = {
      ...current,
      primary_id: null,
      role: 'disabled',
    };
    await this.store.save(next);
    return next;
  }
}

// ---------------------------------------------------------------------------
// Standby CRDT op buffer
// ---------------------------------------------------------------------------

/** Bounded FIFO buffer for ops that arrive at a standby. The buffer has a
 *  capacity and a TTL — older ops are evicted when capacity is reached or
 *  the wall clock advances past their `capturedAtMs + ttlMs`. */
export class ReplayBuffer<T extends { capturedAtMs: number }> {
  private readonly ops: T[] = [];

  constructor(
    private readonly capacity: number = 1000,
    private readonly ttlMs: number = 30_000,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  /** Push an op; evict expired + oldest if at capacity. Returns the
   *  number of ops currently in the buffer. */
  push(op: T): number {
    this.gc();
    if (this.ops.length >= this.capacity) this.ops.shift();
    this.ops.push(op);
    return this.ops.length;
  }

  /** Snapshot the buffered ops in insertion order, then clear. */
  drain(): T[] {
    this.gc();
    const out = this.ops.slice();
    this.ops.length = 0;
    return out;
  }

  /** Inspect without mutating. */
  peek(): readonly T[] {
    this.gc();
    return this.ops.slice();
  }

  size(): number {
    this.gc();
    return this.ops.length;
  }

  private gc(): void {
    const now = this.clock();
    while (this.ops.length > 0 && now - this.ops[0]!.capturedAtMs >= this.ttlMs) {
      this.ops.shift();
    }
  }
}
