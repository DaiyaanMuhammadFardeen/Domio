/**
 * Payout service — creator-side payout history.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 */

import { fetcher } from './fetcher';

const API_BASE = process.env['NEXT_PUBLIC_API_BASE'] ?? 'http://localhost:8080';

export interface CreatorPayoutRow {
  readonly id: string;
  readonly amountCents: number;
  readonly status: 'queued' | 'paid' | 'failed';
  readonly paidAtMs: number | null;
}

export const BOOTSTRAP_CREATOR_PAYOUTS: ReadonlyArray<CreatorPayoutRow> = [];

export async function listCreatorPayouts(
  workspaceId: string,
): Promise<ReadonlyArray<CreatorPayoutRow>> {
  try {
    const json = await fetcher<{ rows?: CreatorPayoutRow[] }>(
      API_BASE,
      `/v1/creator/payouts?workspace_id=${encodeURIComponent(workspaceId)}`,
    );
    return json.rows ?? [];
  } catch {
    return [];
  }
}