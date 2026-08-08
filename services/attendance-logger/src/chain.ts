/**
 * @domio/attendance-logger — hash chain.
 *
 * Pure-function implementation of the SHA-256 chain. The Postgres trigger
 * runs the same algorithm in plpgsql; the TS impl is the source of truth
 * for tests + the in-memory store.
 */

import { createHash } from 'crypto';

export interface ChainInput {
  readonly prev_hash: string | null;
  readonly workspace_id: string;
  readonly session_id: string;
  readonly participant_id: string;
  readonly joined_at_ms: number;
  readonly left_at_ms: number | null;
}

export function chainHash(input: ChainInput): string {
  const parts = [
    input.prev_hash ?? '',
    input.workspace_id,
    input.session_id,
    input.participant_id,
    String(input.joined_at_ms),
    input.left_at_ms === null ? '' : String(input.left_at_ms),
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

export interface ChainVerifyResult {
  readonly intact: boolean;
  readonly broken_at_seq: number | null;
}

export function verifyChain(
  records: ReadonlyArray<{ prev_hash: string | null; hash: string; workspace_id: string; session_id: string; participant_id: string; joined_at_ms: number; left_at_ms: number | null }>,
): ChainVerifyResult {
  let prev: string | null = null;
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (!r) continue;
    if (r.prev_hash !== prev) return { intact: false, broken_at_seq: i };
    const expected = chainHash({
      prev_hash: r.prev_hash,
      workspace_id: r.workspace_id,
      session_id: r.session_id,
      participant_id: r.participant_id,
      joined_at_ms: r.joined_at_ms,
      left_at_ms: r.left_at_ms,
    });
    if (expected !== r.hash) return { intact: false, broken_at_seq: i };
    prev = r.hash;
  }
  return { intact: true, broken_at_seq: null };
}
