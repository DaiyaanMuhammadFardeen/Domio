/**
 * @domio/annotation-engine — idempotency store.
 *
 * Mirrors the @domio/presenter-session idempotency interface exactly so
 * the runtime can wire a single Redis-backed implementation across both
 * services. In-memory and null variants cover tests and dev.
 *
 * Triple-key scoping: (workspace_id, session_id, idempotency_key).
 *   TTL defaults to 24h.
 */
export interface IdempotencyKey {
  key: string;
  workspace_id: string;
  session_id: string;
  ttl_ms: number;
}
export interface IdempotencyReservation {
  exists: boolean;
  prior?: IdempotencyRecord;
}
export interface IdempotencyRecord {
  key: string;
  workspace_id: string;
  session_id: string;
  response: unknown;
  recorded_at_ms: number;
  ttl_ms: number;
}
export interface IdempotencyCommit {
  key: string;
  workspace_id: string;
  session_id: string;
  response: unknown;
  recorded_at_ms: number;
  ttl_ms: number;
}
export interface IdempotencyStore {
  reserve(req: IdempotencyKey): Promise<IdempotencyReservation>;
  commit(commit: IdempotencyCommit): Promise<void>;
  get(key: string, workspace_id: string, session_id: string): Promise<IdempotencyRecord | null>;
}
export declare class NullIdempotencyStore implements IdempotencyStore {
  reserve(): Promise<IdempotencyReservation>;
  commit(): Promise<void>;
  get(): Promise<IdempotencyRecord | null>;
}
export declare class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly map;
  private fqkey;
  reserve(req: IdempotencyKey): Promise<IdempotencyReservation>;
  commit(c: IdempotencyCommit): Promise<void>;
  get(key: string, workspace_id: string, session_id: string): Promise<IdempotencyRecord | null>;
}
//# sourceMappingURL=index.d.ts.map
