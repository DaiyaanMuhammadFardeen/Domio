/**
 * MCP server overview page — Wave 10 §S10.1.
 *
 * Shows whether the MCP server is running, its version + uptime, and the
 * current request rate. Sub-pages: tools, permissions, audit. Action
 * buttons include Restart server and View logs.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { FormattedMessage, adminConsole } from '@domio/ui';
import { Activity, FileText, RefreshCcw, Wrench } from 'lucide-react';
import enMessages from '../../../messages/en.json';
import { Badge, type BadgeTone } from '../../components/Badge';
import { getMCPStatus, type MCPServerStatus } from '../../lib/mcp-service';

const CATALOGUE = enMessages as Readonly<Record<string, string>>;

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 0) return 'in the future';
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function toneForStatus(running: boolean): BadgeTone {
  return running ? 'green' : 'red';
}

function sparkPath(points: number[]): string {
  if (points.length === 0) return '';
  const max = Math.max(...points, 1);
  const stepX = 100 / Math.max(points.length - 1, 1);
  return points
    .map((v, i) => {
      const x = i * stepX;
      const y = 30 - (v / max) * 28;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

// Deterministic placeholder for the request-rate chart.
const SPARK_POINTS: number[] = [
  12, 18, 22, 19, 25, 28, 32, 30, 26, 29, 34, 38, 41, 37, 44, 48, 45, 42, 46, 50,
  48, 44, 41, 38,
];

export default function MCPPage() {
  const [status, setStatus] = useState<MCPServerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restartBusy, setRestartBusy] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await getMCPStatus();
      setStatus(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load MCP status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleRestart() {
    setRestartBusy(true);
    try {
      // Real implementation would POST /v1/mcp/restart. For now we just
      // simulate a brief delay and reload.
      await new Promise((r) => setTimeout(r, 400));
      await loadData();
    } finally {
      setRestartBusy(false);
    }
  }

  function handleViewLogs() {
    // In a real deployment this would open an embedded terminal/log
    // viewer. For now we open a search pre-filled to the platform-api
    // MCP logs stream.
    window.open('about:blank', '_blank');
  }

  return (
    <div className="space-y-6" data-testid="mcp-overview-page">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            <FormattedMessage id="admin.mcp.heading" catalogue={CATALOGUE} />
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Status of the Model Context Protocol server that exposes Domio
            tools to external agents.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="mcp-restart"
            disabled={restartBusy}
            onClick={handleRestart}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCcw className="h-3.5 w-3.5" aria-hidden />
            <FormattedMessage id="admin.mcp.restart" catalogue={CATALOGUE} />
          </button>
          <button
            type="button"
            data-testid="mcp-view-logs"
            onClick={handleViewLogs}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden />
            <FormattedMessage id="admin.mcp.viewLogs" catalogue={CATALOGUE} />
          </button>
        </div>
      </header>

      {error && (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
          role="alert"
        >
          <strong className="font-semibold">Error.</strong> {error}
        </div>
      )}

      {loading && !status ? (
        <div className="space-y-2" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-200" />
          ))}
        </div>
      ) : status ? (
        <>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Status
              </div>
              <div className="mt-2">
                <Badge tone={toneForStatus(status.running)}>
                  <FormattedMessage
                    id={
                      status.running
                        ? 'admin.mcp.status.running'
                        : 'admin.mcp.status.stopped'
                    }
                    catalogue={CATALOGUE}
                  />
                </Badge>
              </div>
              <div className="mt-2 text-[11px] text-slate-500">
                Last restarted {formatRelative(status.last_restarted_ms)}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <FormattedMessage id="admin.mcp.version" catalogue={CATALOGUE} />
              </div>
              <div className="mt-2 font-mono text-lg font-semibold text-slate-900">
                v{status.version}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <FormattedMessage id="admin.mcp.uptime" catalogue={CATALOGUE} />
              </div>
              <div className="mt-2 text-lg font-semibold text-slate-900">
                <FormattedMessage
                  id="admin.mcp.uptimeHours"
                  catalogue={CATALOGUE}
                  values={{ hours: status.uptime_hours }}
                />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <FormattedMessage
                  id="admin.mcp.requestsPerMin"
                  catalogue={CATALOGUE}
                />
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <Activity className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                <span className="text-lg font-semibold text-slate-900">
                  {status.requests_per_min}
                </span>
                <span className="text-xs text-slate-500">/ min</span>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-800">
                  Request rate (last 24h, sample)
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Placeholder sparkline — wired to the real metrics stream once
                  the platform-api exposes it.
                </p>
              </div>
              <span className="text-xs text-slate-400">sparkline placeholder</span>
            </div>
            <svg
              viewBox="0 0 100 30"
              className="mt-3 h-16 w-full"
              preserveAspectRatio="none"
              role="img"
              aria-label="Request rate sparkline"
            >
              <path
                d={sparkPath(SPARK_POINTS)}
                fill="none"
                stroke="rgb(16 185 129)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </section>

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Link
              href={adminConsole('mcp-tools')}
              data-testid="mcp-nav-tools"
              className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 transition hover:border-brand-300 hover:bg-brand-50"
            >
              <div>
                <div className="text-sm font-semibold text-slate-800">
                  Tool registry
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  Every MCP tool registered with the server.
                </div>
              </div>
              <Wrench
                className="h-5 w-5 text-slate-400 group-hover:text-brand-600"
                aria-hidden
              />
            </Link>
            <Link
              href={adminConsole('mcp-permissions')}
              data-testid="mcp-nav-permissions"
              className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 transition hover:border-brand-300 hover:bg-brand-50"
            >
              <div>
                <div className="text-sm font-semibold text-slate-800">
                  Agent permissions
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  Per-agent scopes and token rotation.
                </div>
              </div>
              <Wrench
                className="h-5 w-5 text-slate-400 group-hover:text-brand-600"
                aria-hidden
              />
            </Link>
            <Link
              href={adminConsole('mcp-audit')}
              data-testid="mcp-nav-audit"
              className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 transition hover:border-brand-300 hover:bg-brand-50"
            >
              <div>
                <div className="text-sm font-semibold text-slate-800">
                  Agent audit log
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  Every tool call made by an agent against the platform.
                </div>
              </div>
              <Wrench
                className="h-5 w-5 text-slate-400 group-hover:text-brand-600"
                aria-hidden
              />
            </Link>
          </section>
        </>
      ) : null}
    </div>
  );
}
