/**
 * /cohorts — server component.
 *
 * Pulls the cohort retention matrix from the warehouse via
 * `cohort-service.fetchCohortMatrix`. When the warehouse is
 * unreachable the matrix renders an empty state — never synthetic
 * retention numbers.
 */

import { CohortMatrix } from '../../components/CohortMatrix';
import { fetchCohortMatrix } from '../../lib/cohort-service';

export default async function CohortsPage() {
  const workspaceId = process.env['NEXT_PUBLIC_WORKSPACE_ID'] ?? 'ws-demo';
  const matrix = await fetchCohortMatrix(workspaceId);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Cohort retention</h1>
        <p className="text-sm text-slate-500">
          Weekly cohorts · join-week on the left, week-N retention on the right.
        </p>
      </header>

      <CohortMatrix matrix={matrix} />
    </div>
  );
}
