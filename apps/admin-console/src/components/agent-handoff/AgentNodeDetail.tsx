'use client';

/**
 * Agent node detail panel — Wave 10 §S10.8.
 *
 * Shows the inputs, outputs, handoff tokens, latency, and optional
 * error for a single agent within a pipeline. Designed to sit below
 * the graph visualizer so the operator can sanity-check the latest
 * run that intersected the selected node.
 */

import { clsx } from 'clsx';
import { Badge, type BadgeTone } from '../Badge';
import type { AgentNode, AgentNodeStatus } from '../../lib/agent-handoff-service';

export interface AgentNodeDetailProps {
  node: AgentNode | null;
}

function statusTone(status: AgentNodeStatus): BadgeTone {
  switch (status) {
    case 'done':
      return 'green';
    case 'running':
      return 'amber';
    case 'error':
      return 'red';
    case 'idle':
    default:
      return 'grey';
  }
}

function formatLatency(ms: number | undefined): string {
  if (ms === undefined) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function formatKeyValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function renderKeyValues(record: Record<string, unknown> | undefined): React.ReactNode {
  if (!record) {
    return <span className="text-xs text-slate-400">—</span>;
  }
  const keys = Object.keys(record);
  if (keys.length === 0) {
    return <span className="text-xs text-slate-400">—</span>;
  }
  return (
    <ul className="space-y-1">
      {keys.map((key) => (
        <li
          key={key}
          className="flex items-start justify-between gap-3 rounded-md bg-slate-50 px-2.5 py-1.5"
        >
          <span className="font-mono text-[11px] uppercase tracking-wider text-slate-500">
            {key}
          </span>
          <span className="max-w-[60%] break-all text-right text-xs text-slate-800">
            {formatKeyValue(record[key])}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function AgentNodeDetail({ node }: AgentNodeDetailProps) {
  if (!node) {
    return (
      <div
        data-testid="agent-node-detail-empty"
        className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500"
      >
        Select a node in the graph to see its inputs, outputs, and handoff details.
      </div>
    );
  }

  return (
    <div
      data-testid="agent-node-detail"
      data-node-id={node.id}
      data-status={node.status}
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <header className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Agent
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="text-base font-semibold text-slate-900">{node.name}</span>
            <span className="font-mono text-xs text-slate-500">{node.role}</span>
          </div>
        </div>
        <Badge tone={statusTone(node.status)}>{node.status}</Badge>
      </header>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <section>
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Inputs
          </dt>
          <dd className="mt-1">{renderKeyValues(node.inputs)}</dd>
        </section>

        <section>
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Outputs
          </dt>
          <dd className="mt-1">{renderKeyValues(node.outputs)}</dd>
        </section>

        <section>
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Handoff tokens
          </dt>
          <dd className="mt-1">
            {node.handoff_tokens && node.handoff_tokens.length > 0 ? (
              <ul className="space-y-1">
                {node.handoff_tokens.map((tok) => (
                  <li
                    key={tok}
                    className="rounded-md bg-slate-50 px-2.5 py-1 font-mono text-[11px] text-slate-700"
                  >
                    {tok}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-xs text-slate-400">—</span>
            )}
          </dd>
        </section>

        <section>
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Latency
          </dt>
          <dd className="mt-1">
            <span
              className={clsx(
                'inline-flex items-center rounded-md px-2 py-1 text-xs font-mono',
                node.latency_ms !== undefined
                  ? 'bg-slate-100 text-slate-800'
                  : 'text-slate-400',
              )}
            >
              {formatLatency(node.latency_ms)}
            </span>
          </dd>
        </section>
      </dl>

      {node.error && (
        <section
          data-testid="agent-node-error"
          className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
          role="alert"
        >
          <div className="text-[11px] font-semibold uppercase tracking-wider text-rose-700">
            Error
          </div>
          <div className="mt-1 font-mono text-xs text-rose-900">{node.error}</div>
        </section>
      )}
    </div>
  );
}
