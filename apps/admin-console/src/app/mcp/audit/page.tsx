/**
 * MCP agent audit log page — Wave 10 §S10.1.
 *
 * Filterable log of every tool call made by an agent. Columns:
 * timestamp, agent, tool, args (truncated), result (status + summary),
 * latency_ms, trace_id. Filters at the top: agent, tool, time range.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FormattedMessage } from '@domio/ui';
import enMessages from '../../../../messages/en.json';
import { Badge, type BadgeTone } from '../../../components/Badge';
import { SortableTable, type SortableColumn } from '../../../components/SortableTable';
import {
  listMCPAgents,
  listMCPAudit,
  listMCPTools,
  type MCPAgentPermission,
  type MCPAuditEntry,
  type MCPTool,
} from '../../../lib/mcp-service';

const CATALOGUE = enMessages as Readonly<Record<string, string>>;

type Row = Record<string, unknown> & {
  id: string;
  timestamp_ms: number;
  agent_name: string;
  tool: string;
  args_display: string;
  result_display: string;
  latency_ms: number;
  trace_id: string;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type Range = '1h' | '24h' | '7d' | '30d';

function rangeToSinceMs(range: Range, now: number): number {
  switch (range) {
    case '1h':
      return now - HOUR_MS;
    case '24h':
      return now - DAY_MS;
    case '7d':
      return now - 7 * DAY_MS;
    case '30d':
      return now - 30 * DAY_MS;
  }
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function toneForStatus(code: number): BadgeTone {
  if (code >= 200 && code < 300) return 'green';
  if (code >= 300 && code < 400) return 'amber';
  if (code >= 400 && code < 500) return 'yellow';
  if (code >= 500) return 'red';
  return 'grey';
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export default function MCPAuditPage() {
  const [entries, setEntries] = useState<MCPAuditEntry[]>([]);
  const [agents, setAgents] = useState<MCPAgentPermission[]>([]);
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState<string>('');
  const [toolFilter, setToolFilter] = useState<string>('');
  const [range, setRange] = useState<Range>('24h');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const since = rangeToSinceMs(range, Date.now());
      const opts: { agentId?: string; tool?: string; sinceMs?: number } = {
        sinceMs: since,
      };
      if (agentFilter) opts.agentId = agentFilter;
      if (toolFilter) opts.tool = toolFilter;
      const [list, agentList, toolList] = await Promise.all([
        listMCPAudit(opts),
        listMCPAgents(),
        listMCPTools(),
      ]);
      setEntries(list);
      setAgents(agentList);
      setTools(toolList);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }, [agentFilter, toolFilter, range]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const rows = useMemo<Row[]>(() => {
    return entries.map((e) => {
      const argsStr = JSON.stringify(e.args);
      return {
        id: e.id,
        timestamp_ms: e.timestamp_ms,
        agent_name: e.agent_name,
        tool: e.tool,
        args_display: argsStr,
        result_display: `${e.result_status} ${e.result_summary}`,
        latency_ms: e.latency_ms,
        trace_id: e.trace_id,
      };
    });
  }, [entries]);

  const columns: ReadonlyArray<SortableColumn<Row>> = [
    {
      key: 'timestamp_ms',
      header: CATALOGUE['admin.mcp.audit.col.timestamp'] ?? 'Time',
      type: 'number',
      format: (val) => formatTime(val as number),
    },
    {
      key: 'agent_name',
      header: CATALOGUE['admin.mcp.audit.col.agent'] ?? 'Agent',
      type: 'string',
    },
    {
      key: 'tool',
      header: CATALOGUE['admin.mcp.audit.col.tool'] ?? 'Tool',
      type: 'string',
      format: (val) => <span className="font-mono text-xs text-slate-700">{String(val)}</span>,
    },
    {
      key: 'args_display',
      header: CATALOGUE['admin.mcp.audit.col.args'] ?? 'Args',
      type: 'string',
      format: (val) => (
        <span className="block max-w-md truncate font-mono text-[11px] text-slate-600">
          {truncate(String(val), 120)}
        </span>
      ),
    },
    {
      key: 'result_display',
      header: CATALOGUE['admin.mcp.audit.col.result'] ?? 'Result',
      type: 'string',
      format: (val) => {
        const display = String(val);
        const [codeStr, ...rest] = display.split(' ');
        const code = Number(codeStr);
        const tone = toneForStatus(Number.isFinite(code) ? code : 0);
        const summary = rest.join(' ');
        return (
          <span className="inline-flex items-center gap-1.5">
            <Badge tone={tone}>{codeStr ?? '—'}</Badge>
            <span className="text-xs text-slate-700">{truncate(summary, 80)}</span>
          </span>
        );
      },
    },
    {
      key: 'latency_ms',
      header: CATALOGUE['admin.mcp.audit.col.latency'] ?? 'Latency',
      type: 'number',
      align: 'right',
      format: (val) => <span className="tabular-nums">{String(val)} ms</span>,
    },
    {
      key: 'trace_id',
      header: CATALOGUE['admin.mcp.audit.col.trace'] ?? 'Trace ID',
      type: 'string',
      format: (val) => (
        <span className="font-mono text-[11px] text-slate-500">{truncate(String(val), 16)}</span>
      ),
    },
  ];

  const activeCount = (agentFilter ? 1 : 0) + (toolFilter ? 1 : 0) + (range === '24h' ? 0 : 1);

  return (
    <div className="space-y-4" data-testid="mcp-audit-page">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          <FormattedMessage id="admin.mcp.audit.heading" catalogue={CATALOGUE} />
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Every tool call made by an MCP-registered agent against the platform.
          {activeCount > 0 && (
            <>
              {' '}
              <span className="font-medium text-slate-700">
                {activeCount} filter{activeCount === 1 ? '' : 's'} active
              </span>
              .
            </>
          )}
        </p>
      </header>

      <section
        className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-end sm:justify-between"
        aria-label="Filters"
      >
        <div className="flex flex-col gap-1">
          <label
            className="text-[11px] font-semibold uppercase tracking-wider text-slate-500"
            htmlFor="mcp-audit-agent"
          >
            <FormattedMessage id="admin.mcp.audit.filter.agent" catalogue={CATALOGUE} />
          </label>
          <select
            id="mcp-audit-agent"
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">All</option>
            {agents.map((a) => (
              <option key={a.agent_id} value={a.agent_id}>
                {a.agent_name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label
            className="text-[11px] font-semibold uppercase tracking-wider text-slate-500"
            htmlFor="mcp-audit-tool"
          >
            <FormattedMessage id="admin.mcp.audit.filter.tool" catalogue={CATALOGUE} />
          </label>
          <select
            id="mcp-audit-tool"
            value={toolFilter}
            onChange={(e) => setToolFilter(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">All</option>
            {tools.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label
            className="text-[11px] font-semibold uppercase tracking-wider text-slate-500"
            htmlFor="mcp-audit-range"
          >
            <FormattedMessage id="admin.mcp.audit.filter.range" catalogue={CATALOGUE} />
          </label>
          <select
            id="mcp-audit-range"
            value={range}
            onChange={(e) => setRange(e.target.value as Range)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="1h">
              <FormattedMessage id="admin.mcp.audit.range.1h" catalogue={CATALOGUE} />
            </option>
            <option value="24h">
              <FormattedMessage id="admin.mcp.audit.range.24h" catalogue={CATALOGUE} />
            </option>
            <option value="7d">
              <FormattedMessage id="admin.mcp.audit.range.7d" catalogue={CATALOGUE} />
            </option>
            <option value="30d">
              <FormattedMessage id="admin.mcp.audit.range.30d" catalogue={CATALOGUE} />
            </option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => {
            setAgentFilter('');
            setToolFilter('');
            setRange('24h');
          }}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
        >
          Clear filters
        </button>
      </section>

      {error && (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
          role="alert"
        >
          <strong className="font-semibold">Error.</strong> {error}
        </div>
      )}

      {loading && (
        <div className="space-y-2" aria-busy>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-200" />
          ))}
        </div>
      )}

      {!loading && (
        <SortableTable<Row>
          rows={rows}
          columns={columns}
          emptyMessage={
            CATALOGUE['admin.mcp.audit.empty'] ?? 'No audit events for the selected filters.'
          }
        />
      )}
    </div>
  );
}
