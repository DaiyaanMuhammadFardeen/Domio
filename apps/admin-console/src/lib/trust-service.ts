/**
 * Trust service — admin-side trust scores for workspaces.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Wraps the existing `fetcher` helper so the call site in
 * apps/admin-console/src/app/trust/page.tsx reads cleanly. Returns an
 * empty descriptor on any failure — never fabricated numbers.
 */

import { fetcher } from './fetcher';

export interface TrustScoreRow {
  readonly workspaceId: string;
  readonly score: number;
  readonly tier: 'exemplary' | 'good' | 'watch' | 'restricted';
  readonly computedAtMs: number;
}

const EMPTY_TRUST: TrustScoreRow = {
  workspaceId: '',
  score: 0,
  tier: 'watch',
  computedAtMs: 0,
};

/**
 * Fetch the trust score for a single workspace.
 *
 * Returns the empty descriptor on any failure.
 */
export async function fetchTrustScore(workspaceId: string): Promise<TrustScoreRow> {
  try {
    const json = await fetcher<{ rows?: TrustScoreRow[] }>(
      `/v1/admin/trust?workspace_id=${encodeURIComponent(workspaceId)}`,
    );
    const row = (json.rows ?? []).find((r) => r.workspaceId === workspaceId);
    return row ?? EMPTY_TRUST;
  } catch {
    return EMPTY_TRUST;
  }
}

/**
 * Fetch all trust scores for the admin's view. Returns an empty list
 * on any failure.
 */
export async function listTrustScores(): Promise<ReadonlyArray<TrustScoreRow>> {
  try {
    const json = await fetcher<{ rows?: TrustScoreRow[] }>('/v1/admin/trust');
    return json.rows ?? [];
  } catch {
    return [];
  }
}