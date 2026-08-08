/**
 * /ab — server component.
 *
 * Lists A/B experiments with status. In production the dashboard
 * fetches the experiment list from ab-assignment and the lift/p/CI
 * per experiment from ab-measurement + ab-statistics. For the
 * scaffold we render representative stub data so the page is
 * navigable without those services running.
 */

import { DecisionTable, type DecisionRow } from './DecisionTable';

const STUB_EXPERIMENTS: DecisionRow[] = [
  {
    experimentId: 'exp-001',
    experimentName: 'Hero CTA color',
    status: 'significant',
    variants: 'control / treatment',
    sampleSizes: '12,400 / 12,580',
    conversionRates: '4.2% / 5.1%',
    liftPct: 0.214,
    pValue: 0.012,
    ciLow: 0.04,
    ciHigh: 0.38,
  },
  {
    experimentId: 'exp-002',
    experimentName: 'Onboarding flow',
    status: 'underpowered',
    variants: 'a / b / c',
    sampleSizes: '320 / 318 / 305',
    conversionRates: '12.0% / 13.4% / 12.8%',
    liftPct: 0.116,
    pValue: 0.421,
    ciLow: -0.05,
    ciHigh: 0.27,
  },
  {
    experimentId: 'exp-003',
    experimentName: 'Pricing page headline',
    status: 'inconclusive',
    variants: 'control / treatment',
    sampleSizes: '5,800 / 5,720',
    conversionRates: '2.4% / 2.5%',
    liftPct: 0.041,
    pValue: 0.612,
    ciLow: -0.02,
    ciHigh: 0.11,
  },
  {
    experimentId: 'exp-004',
    experimentName: 'Email subject line',
    status: 'running',
    variants: 'a / b',
    sampleSizes: '20,100 / 20,300',
    conversionRates: '22.0% / 22.6%',
    liftPct: 0.027,
    pValue: 0.18,
    ciLow: -0.01,
    ciHigh: 0.06,
  },
  {
    experimentId: 'exp-005',
    experimentName: 'Footer copy',
    status: 'archived',
    variants: 'control / treatment',
    sampleSizes: '50,000 / 50,000',
    conversionRates: '1.4% / 1.4%',
    liftPct: 0.0,
    pValue: 0.99,
    ciLow: -0.02,
    ciHigh: 0.02,
  },
];

const AB_ASSIGNMENT_URL =
  process.env['AB_ASSIGNMENT_URL'] ?? 'http://localhost:8090';

interface AbAssignmentExperiment {
  id: string;
  name: string;
  status: string;
}

async function fetchExperiments(workspaceId: string): Promise<AbAssignmentExperiment[]> {
  const url = new URL('/v1/experiments', AB_ASSIGNMENT_URL);
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

export default async function AbPage() {
  const workspaceId = process.env['NEXT_PUBLIC_WORKSPACE_ID'] ?? 'ws-demo';
  const live = await fetchExperiments(workspaceId);
  const rows: DecisionRow[] =
    live.length > 0
      ? live.map((e) => ({
          experimentId: e.id,
          experimentName: e.name,
          status: (['significant', 'underpowered', 'inconclusive', 'running', 'archived'].includes(
            e.status,
          )
            ? e.status
            : 'running') as DecisionRow['status'],
          variants: 'a / b',
          sampleSizes: '—',
          conversionRates: '—',
          liftPct: 0,
          pValue: 1,
          ciLow: 0,
          ciHigh: 0,
        }))
      : STUB_EXPERIMENTS;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">A/B tests</h1>
        <p className="text-sm text-slate-500">
          Decisions from ab-measurement + ab-statistics
        </p>
      </header>
      <DecisionTable rows={rows} />
    </div>
  );
}