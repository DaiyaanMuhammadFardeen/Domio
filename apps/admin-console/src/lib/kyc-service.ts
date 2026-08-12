/**
 * KYC service — admin-side KYC review queue.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 */

import { fetcher } from './fetcher';

export interface KycRow {
  readonly id: string;
  readonly creatorId: string;
  readonly status: 'pending' | 'approved' | 'rejected';
  readonly submittedAtMs: number;
}

export const BOOTSTRAP_KYC: ReadonlyArray<KycRow> = [];

export async function listKyc(): Promise<ReadonlyArray<KycRow>> {
  try {
    const json = await fetcher<{ rows?: KycRow[] }>('/v1/admin/kyc');
    return json.rows ?? [];
  } catch {
    return [];
  }
}