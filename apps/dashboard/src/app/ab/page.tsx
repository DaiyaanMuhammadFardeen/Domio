/**
 * /ab — server component.
 *
 * Lists A/B experiments fetched from ab-assignment. When the service
 * has no data, the page renders an actionable empty state — never a
 * hardcoded list. Per Wave 1 §S1.9.
 */

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
      {rows.length === 0 ? (
        <div
          className="rounded-xl border border-slate-200 bg-white p-8 text-center"
          role="status"
        >
          <h2 className="text-base font-semibold text-slate-900">No experiments yet</h2>
          <p className="mt-2 text-sm text-slate-500">
            Spin up an A/B test from the ab-assignment service to see it here. Lift,
            p-value, and confidence-interval columns populate once ab-measurement
            and ab-statistics report back.
          </p>
        </div>
      ) : (
        <DecisionTable rows={rows} />
      )}
    </div>
  );
}