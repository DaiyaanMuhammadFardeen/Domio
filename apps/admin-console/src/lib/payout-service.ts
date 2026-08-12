/**
 * Payout service — admin-side marketplace payout queue.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 */

import { fetcher } from './fetcher';

export interface PayoutRow {
  readonly id: string;
  readonly creatorId: string;
  readonly amountCents: number;
  readonly status: 'queued' | 'paid' | 'failed';
  readonly createdAtMs: number;
}

export const BOOTSTRAP_PAYOUTS: ReadonlyArray<PayoutRow> = [];

export async function listPayouts(): Promise<ReadonlyArray<PayoutRow>> {
  try {
    const json = await fetcher<{ rows?: PayoutRow[] }>('/v1/admin/payouts');
    return json.rows ?? [];
  } catch {
    return [];
  }
}