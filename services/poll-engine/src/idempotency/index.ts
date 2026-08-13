/**
 * @domio/poll-engine — idempotency store.
 *
 * Voter-facing mutations (cast vote) carry an idempotency key so retries
 * from flaky mobile networks don't double-vote.
 */

export interface IdempotencyRecord {
  key: string;
  workspace_id: string;
  poll_id: string;
  response: unknown;
  recorded_at_ms: number;
  expires_at_ms: number;
}

export interface IdempotencyStore {
  reserve(args: {
    key: string;
    workspace_id: string;
    poll_id: string;
    ttl_ms: number;
  }): Promise<{ exists: boolean; prior?: IdempotencyRecord }>;
  commit(record: Omit<IdempotencyRecord, 'expires_at_ms'> & { ttl_ms: number }): Promise<void>;
  get(key: string, workspace_id: string, poll_id: string): Promise<IdempotencyRecord | null>;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, IdempotencyRecord>();
  private tripleKey(key: string, workspaceId: string, pollId: string): string {
    return `${workspaceId}::${pollId}::${key}`;
  }

  async reserve(args: {
    key: string;
    workspace_id: string;
    poll_id: string;
    ttl_ms: number;
  }): Promise<{ exists: boolean; prior?: IdempotencyRecord }> {
    const k = this.tripleKey(args.key, args.workspace_id, args.poll_id);
    const existing = this.records.get(k);
    if (existing && existing.response !== undefined) {
      return { exists: true, prior: existing };
    }
    if (!existing) {
      this.records.set(k, {
        key: args.key,
        workspace_id: args.workspace_id,
        poll_id: args.poll_id,
        response: undefined,
        recorded_at_ms: 0,
        expires_at_ms: 0,
      });
    }
    return { exists: false };
  }

  async commit(
    record: Omit<IdempotencyRecord, 'expires_at_ms'> & { ttl_ms: number },
  ): Promise<void> {
    const k = this.tripleKey(record.key, record.workspace_id, record.poll_id);
    this.records.set(k, {
      key: record.key,
      workspace_id: record.workspace_id,
      poll_id: record.poll_id,
      response: record.response,
      recorded_at_ms: record.recorded_at_ms,
      expires_at_ms: record.recorded_at_ms + record.ttl_ms,
    });
  }

  async get(key: string, workspace_id: string, poll_id: string): Promise<IdempotencyRecord | null> {
    const k = this.tripleKey(key, workspace_id, poll_id);
    const r = this.records.get(k);
    if (!r) return null;
    if (r.response === undefined) return null;
    return r;
  }

  clear(): void {
    this.records.clear();
  }
}
