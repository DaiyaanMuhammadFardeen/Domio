/**
 * Listing service — creator-side marketplace listings.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 */

import { fetcher } from './fetcher';

const API_BASE = process.env['NEXT_PUBLIC_API_BASE'] ?? 'http://localhost:8080';

export interface ListingRow {
  readonly id: string;
  readonly title: string;
  readonly status: 'draft' | 'pending' | 'live' | 'rejected';
  readonly updatedAtMs: number;
}

export const BOOTSTRAP_LISTINGS: ReadonlyArray<ListingRow> = [];

export async function listListings(workspaceId: string): Promise<ReadonlyArray<ListingRow>> {
  try {
    const json = await fetcher<{ rows?: ListingRow[] }>(
      API_BASE,
      `/v1/creator/listings?workspace_id=${encodeURIComponent(workspaceId)}`,
    );
    return json.rows ?? [];
  } catch {
    return [];
  }
}
