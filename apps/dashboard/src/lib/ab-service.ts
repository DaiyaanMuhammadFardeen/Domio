/**
 * ab-service — typed client for the A/B testing surface.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Wraps the ab-assignment HTTP endpoint and maps to the DecisionTable
 * row shape the dashboard renders. Real measurements (lift / p-value /
 * confidence interval) come from ab-measurement + ab-statistics once
 * those services expose their typed clients — until then the dashboard
 * renders an empty state instead of fabricating numbers.
 */

export interface AbAssignmentExperiment {
  readonly id: string;
  readonly name: string;
  readonly status: string;
}

/**
 * Fetch the list of experiments for a workspace from ab-assignment.
 *
 * @param workspaceId The workspace whose experiments should be listed.
 * @param baseUrl     The ab-assignment service URL (defaults to the
 *                    env var, or `http://localhost:8090` in dev).
 * @returns The raw experiment list, or an empty array on any failure.
 *          The caller decides what to render in the empty case.
 */
export async function fetchExperiments(
  workspaceId: string,
  baseUrl: string = process.env['AB_ASSIGNMENT_URL'] ?? 'http://localhost:8090',
): Promise<ReadonlyArray<AbAssignmentExperiment>> {
  const url = new URL('/v1/experiments', baseUrl);
  url.searchParams.set('workspace_id', workspaceId);
  try {
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) return [];
    const json = (await res.json()) as { experiments?: AbAssignmentExperiment[] };
    return json.experiments ?? [];
  } catch {
    return [];
  }
}
