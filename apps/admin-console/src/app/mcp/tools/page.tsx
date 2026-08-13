/**
 * MCP tool registry page — Wave 10 §S10.1.
 *
 * Lists every tool registered with the MCP server with its name,
 * description, params count, return shape, rate-limit class, and an
 * enabled toggle. Clicking a row opens a drawer with the full JSON
 * schema for params + return.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FormattedMessage } from '@domio/ui';
import enMessages from '../../../../messages/en.json';
import { Badge, type BadgeTone } from '../../../components/Badge';
import { MCPToolDetailDrawer } from '../../../components/mcp/MCPToolDetailDrawer';
import { listMCPTools, type MCPTool } from '../../../lib/mcp-service';

const CATALOGUE = enMessages as Readonly<Record<string, string>>;

function toneForRateLimit(cls: MCPTool['rate_limit_class']): BadgeTone {
  switch (cls) {
    case 'high':
      return 'green';
    case 'medium':
      return 'amber';
    case 'low':
      return 'red';
    default:
      return 'grey';
  }
}

function humanRateLimit(cls: MCPTool['rate_limit_class']): string {
  switch (cls) {
    case 'high':
      return '1000 req/min';
    case 'medium':
      return '100 req/min';
    case 'low':
      return '20 req/min';
    default:
      return '—';
  }
}

function countParams(schema: Record<string, unknown>): number {
  const props = schema['properties'];
  if (props && typeof props === 'object') {
    return Object.keys(props as Record<string, unknown>).length;
  }
  return 0;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function returnShapeSummary(schema: Record<string, unknown>): string {
  const props = schema['properties'];
  if (!props || typeof props !== 'object') return 'object';
  const keys = Object.keys(props as Record<string, unknown>);
  if (keys.length === 0) return 'object';
  return `{ ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', …' : ''} }`;
}

export default function MCPToolsPage() {
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MCPTool | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listMCPTools();
      setTools(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tools');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function toggleEnabled(name: string) {
    setTools((prev) =>
      prev.map((t) => (t.name === name ? { ...t, enabled: !t.enabled } : t)),
    );
  }

  const sorted = useMemo(() => {
    return [...tools].sort((a, b) => a.name.localeCompare(b.name));
  }, [tools]);

  return (
    <div className="space-y-4" data-testid="mcp-tools-page">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          <FormattedMessage id="admin.mcp.tools.heading" catalogue={CATALOGUE} />
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Every tool the MCP server exposes to external agents. Click any row
          for the full JSON schema.
        </p>
      </header>

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
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-200" />
          ))}
        </div>
      )}

      {!loading && tools.length === 0 && (
        <div
          className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500"
          data-testid="mcp-tools-empty"
        >
          <FormattedMessage id="admin.mcp.tools.empty" catalogue={CATALOGUE} />
        </div>
      )}

      {!loading && sorted.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <FormattedMessage
                      id="admin.mcp.tools.col.name"
                      catalogue={CATALOGUE}
                    />
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <FormattedMessage
                      id="admin.mcp.tools.col.description"
                      catalogue={CATALOGUE}
                    />
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <FormattedMessage
                      id="admin.mcp.tools.col.params"
                      catalogue={CATALOGUE}
                    />
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <FormattedMessage
                      id="admin.mcp.tools.col.return"
                      catalogue={CATALOGUE}
                    />
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <FormattedMessage
                      id="admin.mcp.tools.col.rateLimit"
                      catalogue={CATALOGUE}
                    />
                  </th>
                  <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <FormattedMessage
                      id="admin.mcp.tools.col.enabled"
                      catalogue={CATALOGUE}
                    />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map((tool) => (
                  <tr
                    key={tool.name}
                    data-testid={`mcp-tool-row-${tool.name}`}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => setSelected(tool)}
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-slate-800">
                      {tool.name}
                    </td>
                    <td className="max-w-md px-4 py-2.5 text-slate-700">
                      <span className="line-clamp-2">
                        {truncate(tool.description, 140)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-slate-800">
                      {countParams(tool.params_schema)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-slate-600">
                      {returnShapeSummary(tool.return_schema)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={toneForRateLimit(tool.rate_limit_class)}>
                        {humanRateLimit(tool.rate_limit_class)}
                      </Badge>
                    </td>
                    <td
                      className="px-4 py-2.5 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        role="switch"
                        aria-checked={tool.enabled}
                        aria-label={`Toggle ${tool.name}`}
                        data-testid={`mcp-tool-toggle-${tool.name}`}
                        onClick={() => toggleEnabled(tool.name)}
                        className={
                          tool.enabled
                            ? 'inline-flex h-5 w-9 items-center rounded-full bg-emerald-500 p-0.5 transition'
                            : 'inline-flex h-5 w-9 items-center rounded-full bg-slate-300 p-0.5 transition'
                        }
                      >
                        <span
                          className={
                            tool.enabled
                              ? 'ml-auto h-4 w-4 rounded-full bg-white shadow'
                              : 'h-4 w-4 rounded-full bg-white shadow'
                          }
                        />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <MCPToolDetailDrawer
        tool={selected}
        open={selected !== null}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
