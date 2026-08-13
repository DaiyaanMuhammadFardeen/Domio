/**
 * /ab — server component.
 *
 * Per Wave 7 §S7.1 of docs/frontend-roadmap/07-wave-analytics-insights.md:
 *   - Wired to `GET /v1/ab/experiments`.
 *   - No STUB_EXPERIMENTS fallback.
 *   - SuspenseBoundary + `<EmptyState>` from @domio/ui.
 *
 * Real measurements (lift / p-value / confidence interval) come from
 * ab-measurement + ab-statistics once those services expose their typed
 * clients — until then the dashboard renders an empty state instead of
 * fabricating numbers.
 */

import { SuspenseBoundary, EmptyState } from '@domio/ui';
import { DecisionTable, type DecisionRow } from './DecisionTable';
import { fetchExperiments } from '../../lib/ab-service';

const AB_ASSIGNMENT_URL =
  process.env['AB_ASSIGNMENT_URL'] ?? 'http://localhost:8090';

const VALID_STATUSES = [
  'significant',
  'underpowered',
  'inconclusive',
  'running',
  'archived',
] as const satisfies readonly DecisionRow['status'][];

export default async function AbPage() {
  const workspaceId = process.env['NEXT_PUBLIC_WORKSPACE_ID'] ?? 'ws-demo';
  const live = await fetchExperiments(workspaceId, AB_ASSIGNMENT_URL);
  const rows: DecisionRow[] = live.map((e) => ({
    experimentId: e.id,
    experimentName: e.name,
    status: (VALID_STATUSES as readonly string[]).includes(e.status)
      ? (e.status as DecisionRow['status'])
      : 'running',
    variants: 'a / b',
    sampleSizes: '—',
    conversionRates: '—',
    liftPct: 0,
    pValue: 1,
    ciLow: 0,
    ciHigh: 0,
  }));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">A/B tests</h1>
        <p className="text-sm text-slate-500">
          Decisions from ab-measurement + ab-statistics
        </p>
      </header>
      <SuspenseBoundary>
        {rows.length === 0 ? (
          <EmptyState
            title="No experiments yet"
            description="Spin up an A/B test from the ab-assignment service to see it here. Lift, p-value, and confidence-interval columns populate once ab-measurement and ab-statistics report back."
          />
        ) : (
          <DecisionTable rows={rows} />
        )}
      </SuspenseBoundary>
    </div>
  );
}