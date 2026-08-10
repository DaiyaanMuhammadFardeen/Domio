'use client';

import { SortableTable, type SortableColumn } from '../../../components/SortableTable';

export interface SlideRow extends Record<string, unknown> {
  slideId: string;
  views: number;
  uniqueViewers: number;
  avgDwellMs: number;
  bounceRate: number;
}

const COLUMNS: ReadonlyArray<SortableColumn<SlideRow>> = [
  { key: 'slideId', header: 'Slide', type: 'string' },
  {
    key: 'views',
    header: 'Views',
    type: 'number',
    align: 'right',
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: 'uniqueViewers',
    header: 'Unique viewers',
    type: 'number',
    align: 'right',
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: 'avgDwellMs',
    header: 'Avg dwell (ms)',
    type: 'number',
    align: 'right',
    format: (v) => Number(v).toFixed(0),
  },
  {
    key: 'bounceRate',
    header: 'Bounce',
    type: 'number',
    align: 'right',
    format: (v) => `${(Number(v) * 100).toFixed(1)}%`,
  },
];

export function SlideBreakdownTable({ rows }: { rows: SlideRow[] }) {
  return <SortableTable rows={rows} columns={COLUMNS} emptyMessage="No slide data" />;
}