/**
 * Analytics service — creator-side listing analytics.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 */

import { fetcher } from './fetcher';

const API_BASE = process.env['NEXT_PUBLIC_API_BASE'] ?? 'http://localhost:8080';

export interface CreatorAnalyticsRow {
  readonly listingId: string;
  readonly views: number;
  readonly conversions: number;
  readonly revenueCents: number;
}

export const BOOTSTRAP_CREATOR_ANALYTICS: ReadonlyArray<CreatorAnalyticsRow> = [];

export async function listCreatorAnalytics(
  workspaceId: string,
): Promise<ReadonlyArray<CreatorAnalyticsRow>> {
  try {
    const json = await fetcher<{ rows?: CreatorAnalyticsRow[] }>(
      API_BASE,
      `/v1/creator/analytics?workspace_id=${encodeURIComponent(workspaceId)}`,
    );
    return json.rows ?? [];
  } catch {
    return [];
  }
}