/**
 * @domio/session-coordinator — in-memory store.
 *
 * Phase 16 W1. Backs the coordinator's read paths during dev and
 * tests. Production replaces this with the Postgres implementation
 * reading from session_membership.
 */

import type {
  ListMembershipInput,
  ListMembershipResult,
  MembershipRow,
  SessionSummary,
  ShardFanoutPlan,
} from '../types.js';
import type { SessionCoordinatorStore } from '../store.js';

export class InMemorySessionCoordinatorStore implements SessionCoordinatorStore {
  private rows: MembershipRow[] = [];

  upsert(row: MembershipRow): void {
    const idx = this.rows.findIndex(
      (r) => r.session_id === row.session_id && r.participant_id === row.participant_id,
    );
    if (idx >= 0) this.rows[idx] = row;
    else this.rows.push(row);
  }

  remove(input: { session_id: string; participant_id: string }): void {
    this.rows = this.rows.filter(
      (r) => !(r.session_id === input.session_id && r.participant_id === input.participant_id),
    );
  }

  private rowsFor(input: { workspace_id: string; session_id: string }): MembershipRow[] {
    return this.rows.filter(
      (r) => r.workspace_id === input.workspace_id && r.session_id === input.session_id,
    );
  }

  async summarize(input: {
    workspace_id: string;
    session_id: string;
  }): Promise<SessionSummary | null> {
    const rows = this.rowsFor(input);
    if (rows.length === 0) return null;
    const active = rows.filter((r) => r.state === 'active' || r.state === 'idle');
    const shards = new Set(rows.map((r) => r.shard_index));
    const joined = rows.map((r) => r.joined_at).sort();
    return {
      workspace_id: input.workspace_id,
      session_id: input.session_id,
      // session_code isn't materialised at the coordinator layer; the
      // presenter-session service resolves it. The caller fills it in.
      session_code: '' as never,
      total_participants: rows.length,
      active_participants: active.length,
      shards_touched: shards.size,
      last_join_at: joined[joined.length - 1] ?? null,
      last_leave_at: null,
    };
  }

  async listMembership(input: ListMembershipInput): Promise<ListMembershipResult> {
    let rows = this.rowsFor({ workspace_id: input.workspace_id, session_id: input.session_id });
    if (typeof input.since_ms === 'number') {
      const sinceIso = new Date(input.since_ms).toISOString();
      rows = rows.filter((r) => r.last_seen_at >= sinceIso);
    }
    rows.sort((a, b) => a.last_seen_at.localeCompare(b.last_seen_at));
    const limit = input.limit ?? 100;
    const page = rows.slice(0, limit);
    const next = rows.length > limit ? (page[page.length - 1]?.last_seen_at ?? null) : null;
    return { items: page, next_cursor: next };
  }

  async fanoutPlan(input: {
    workspace_id: string;
    session_id: string;
  }): Promise<ShardFanoutPlan | null> {
    const rows = this.rowsFor(input);
    if (rows.length === 0) return null;
    const active = rows.filter((r) => r.state === 'active' || r.state === 'idle');
    const shards = Array.from(new Set(active.map((r) => r.shard_index))).sort((a, b) => a - b);
    return {
      session_id: input.session_id,
      workspace_id: input.workspace_id,
      shards,
      fanout_size: active.length,
    };
  }

  async exportMembership(input: {
    workspace_id: string;
    session_id: string;
  }): Promise<ReadonlyArray<MembershipRow>> {
    return [...this.rowsFor(input)];
  }
}
