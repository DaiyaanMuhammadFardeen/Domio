/**
 * Takedown service — admin-side takedown queue.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Wraps the existing `fetcher` helper. Returns an empty list on
 * failure — never fabricated takedown entries.
 */

import { fetcher } from './fetcher';

export interface TakedownRow {
  readonly id: string;
  readonly deckId: string;
  readonly status: 'pending' | 'approved' | 'denied';
  readonly reason: string;
  readonly createdAtMs: number;
}

export const BOOTSTRAP_TAKEDOWNS: ReadonlyArray<TakedownRow> = [];

export async function listTakedowns(): Promise<ReadonlyArray<TakedownRow>> {
  try {
    const json = await fetcher<{ rows?: TakedownRow[] }>('/v1/admin/takedowns');
    return json.rows ?? [];
  } catch {
    return [];
  }
}