'use client';

/**
 * AgentUsageTable — sortable per-agent breakdown for the spend dashboard.
 *
 * Per Wave 10 §S10.6. Wraps the existing SortableTable so the columns
 * are uniform with the rest of the admin console. Cost column is
 * rendered right-aligned and formatted as USD.
 */

import type { ReactElement } from 'react';
import { SortableTable, type SortableColumn } from '../SortableTable';
import type { AgentUsage } from '../../lib/billing-service';
import { formatCents, formatCompact } from '../../lib/billing-service';

export type AgentUsageRow = Record<string, unknown> & AgentUsage;

export interface AgentUsageTableProps {
  readonly rows: ReadonlyArray<AgentUsageRow>;
  readonly emptyMessage?: string;
}

export function AgentUsageTable({
  rows,
  emptyMessage = 'No agents yet.',
}: AgentUsageTableProps): ReactElement {
  const columns: ReadonlyArray<SortableColumn<AgentUsageRow>> = [
    {
      key: 'agent_name',
      header: 'Agent',
      type: 'string',
    },
    {
      key: 'api_calls',
      header: 'API',
      type: 'number',
      align: 'right',
      format: (val) => formatCompact(Number(val)),
    },
    {
      key: 'ai_tokens',
      header: 'Tokens',
      type: 'number',
      align: 'right',
      format: (val) => formatCompact(Number(val)),
    },
    {
      key: 'render_minutes',
      header: 'Render',
      type: 'number',
      align: 'right',
      format: (val) => formatCompact(Number(val)),
    },
    {
      key: 'export_minutes',
      header: 'Export',
      type: 'number',
      align: 'right',
      format: (val) => formatCompact(Number(val)),
    },
    {
      key: 'cost_cents',
      header: 'Cost',
      type: 'number',
      align: 'right',
      format: (val) => formatCents(Number(val)),
    },
  ];

  return (
    <SortableTable
      rows={rows as AgentUsageRow[]}
      columns={columns}
      emptyMessage={emptyMessage}
    />
  );
}
