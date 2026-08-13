/**
 * Brand-lock service — admin-side brand-locked deck review queue.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 */

import { fetcher } from './fetcher';

export interface BrandLockRow {
  readonly deckId: string;
  readonly workspaceId: string;
  readonly brandKitId: string;
  readonly status: 'pending' | 'approved' | 'rejected';
  readonly requestedAtMs: number;
}

export const BOOTSTRAP_BRAND_LOCKS: ReadonlyArray<BrandLockRow> = [];

export async function listBrandLocks(): Promise<ReadonlyArray<BrandLockRow>> {
  try {
    const json = await fetcher<{ rows?: BrandLockRow[] }>('/v1/admin/brand-locks');
    return json.rows ?? [];
  } catch {
    return [];
  }
}
