/**
 * @domio/session-coordinator — store interface.
 *
 * Phase 16 W1. The coordinator never owns write paths; its store is
 * read-only. Two implementations:
 *   - `InMemorySessionCoordinatorStore` — for tests
 *   - `PostgresSessionCoordinatorStore` — production (uses
 *     session_membership directly)
 *
 * Cross-shard queries are intentionally NOT made here; they happen
 * in the WS gateway which queries per-shard Postgres pools.
 */

import type {
  ListMembershipInput,
  ListMembershipResult,
  MembershipRow,
  SessionSummary,
  ShardFanoutPlan,
} from './types.js';

export interface SessionCoordinatorStore {
  /** Returns a one-row summary for a presenter session. */
  summarize(input: { workspace_id: string; session_id: string }): Promise<SessionSummary | null>;
  /** Lists active membership rows for a session. */
  listMembership(input: ListMembershipInput): Promise<ListMembershipResult>;
  /** Returns the shards that have active participants for fan-out. */
  fanoutPlan(input: { workspace_id: string; session_id: string }): Promise<ShardFanoutPlan | null>;
  /** Replayable row projection for export. */
  exportMembership(input: {
    workspace_id: string;
    session_id: string;
  }): Promise<ReadonlyArray<MembershipRow>>;
}

export function isCoordinatorStore(v: unknown): v is SessionCoordinatorStore {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.summarize === 'function' &&
    typeof o.listMembership === 'function' &&
    typeof o.fanoutPlan === 'function' &&
    typeof o.exportMembership === 'function'
  );
}
