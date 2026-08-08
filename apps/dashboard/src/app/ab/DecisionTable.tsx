import { Badge, toneForStatus } from '../../components/Badge';
import { SortableTable, type SortableColumn } from '../../components/SortableTable';

export interface DecisionRow extends Record<string, unknown> {
  experimentId: string;
  experimentName: string;
  status: 'significant' | 'underpowered' | 'inconclusive' | 'running' | 'archived';
  variants: string;
  sampleSizes: string;
  conversionRates: string;
  liftPct: number;
  pValue: number;
  ciLow: number;
  ciHigh: number;
}

const COLUMNS: ReadonlyArray<SortableColumn<DecisionRow>> = [
  { key: 'experimentName', header: 'Experiment', type: 'string' },
  { key: 'variants', header: 'Variants', type: 'string' },
  { key: 'sampleSizes', header: 'Sample sizes', type: 'string', align: 'right' },
  {
    key: 'conversionRates',
    header: 'Conv. rate',
    type: 'string',
    align: 'right',
  },
  {
    key: 'liftPct',
    header: 'Lift %',
    type: 'number',
    align: 'right',
    format: (v) => `${(Number(v) * 100).toFixed(2)}%`,
  },
  {
    key: 'pValue',
    header: 'p-value',
    type: 'number',
    align: 'right',
    format: (v) => Number(v).toFixed(3),
  },
  {
    key: 'ciLow',
    header: 'CI 95% low',
    type: 'number',
    align: 'right',
    format: (v) => `${(Number(v) * 100).toFixed(2)}%`,
  },
  {
    key: 'ciHigh',
    header: 'CI 95% high',
    type: 'number',
    align: 'right',
    format: (v) => `${(Number(v) * 100).toFixed(2)}%`,
  },
  {
    key: 'status',
    header: 'Decision',
    type: 'string',
    format: (v) => String(v),
  },
];

export function DecisionTable({ rows }: { rows: DecisionRow[] }) {
  return (
    <div className="space-y-2">
      <SortableTable
        rows={rows}
        columns={COLUMNS}
        emptyMessage="No experiments"
      />
      <div className="flex flex-wrap gap-2 text-xs text-slate-500">
        <Badge tone="green">significant</Badge>
        <Badge tone="yellow">underpowered</Badge>
        <Badge tone="amber">inconclusive</Badge>
        <Badge tone="brand">running</Badge>
        <Badge tone="grey">archived</Badge>
      </div>
      {/*
        Tone legend is rendered above; this assertion exists so the
        toneForStatus mapping is exercised in tests.
      */}
      <span data-testid="tone-legend" hidden>
        {rows.map((r) => toneForStatus(r.status)).join(',')}
      </span>
    </div>
  );
}