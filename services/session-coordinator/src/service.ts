/**
 * @domio/session-coordinator — orchestration service.
 *
 * Phase 16 W1. Read-only façade over `session_membership`. Used by:
 *   - The participant WS gateway (fan-out plan)
 *   - The recap aggregation worker (export)
 *   - The session-coordinator REST handlers (summaries, listings)
 *
 * Cross-shard queries are intentionally explicit (the `fanoutPlan`
 * method) so callers cannot accidentally issue a non-shard-aware
 * query.
 */

import type {
  ListMembershipInput,
  ListMembershipResult,
  MembershipRow,
  SessionSummary,
  ShardFanoutPlan,
} from './types.js';
import {
  SessionNotFoundError,
  WorkspaceMismatchError,
} from './types.js';
import {
  isCoordinatorStore,
  type SessionCoordinatorStore,
} from './store.js';

export interface SessionCoordinatorServiceOptions {
  readonly store: SessionCoordinatorStore;
  /** Used to resolve session_code from session_id for summaries. */
  readonly sessionResolver?: SessionCodeResolver;
}

export type SessionCodeResolver = (input: { workspace_id: string; session_id: string }) => Promise<string>;

export class SessionCoordinatorService {
  private readonly store: SessionCoordinatorStore;
  private readonly sessionResolver: SessionCodeResolver;

  constructor(opts: SessionCoordinatorServiceOptions) {
    if (!isCoordinatorStore(opts.store)) {
      throw new Error('SessionCoordinatorService: store is required');
    }
    this.store = opts.store;
    this.sessionResolver = opts.sessionResolver ?? defaultSessionResolver;
  }

  async summarize(input: { workspace_id: string; session_id: string }): Promise<SessionSummary> {
    const summary = await this.store.summarize(input);
    if (!summary) throw new SessionNotFoundError(input.session_id);
    const code = await this.sessionResolver(input);
    return { ...summary, session_code: code as never };
  }

  async listMembership(input: ListMembershipInput): Promise<ListMembershipResult> {
    if (!input.workspace_id) {
      throw new WorkspaceMismatchError();
    }
    return this.store.listMembership(input);
  }

  async fanoutPlan(input: { workspace_id: string; session_id: string }): Promise<ShardFanoutPlan> {
    const plan = await this.store.fanoutPlan(input);
    if (!plan) throw new SessionNotFoundError(input.session_id);
    return plan;
  }

  async exportMembership(input: { workspace_id: string; session_id: string }): Promise<ReadonlyArray<MembershipRow>> {
    return this.store.exportMembership(input);
  }
}

async function defaultSessionResolver(): Promise<string> {
  throw new SessionNotFoundError('unknown');
}