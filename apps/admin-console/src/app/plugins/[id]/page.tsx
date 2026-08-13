/**
 * Plugin detail page — Wave 8 §S8.9.
 *
 * Renders a single plugin's full metadata, scopes, deprecation notice,
 * and a recent audit log slice. Includes an action button to flip the
 * plugin between installed / deprecated states.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ShieldOff, Plus } from 'lucide-react';
import { adminConsole } from '@domio/ui';
import { Badge, type BadgeTone } from '../../../components/Badge';
import {
  disablePlugin,
  enablePlugin,
  getPlugin,
  getPluginAuditLog,
  SCOPE_LABELS,
  type PluginAuditEvent,
} from '../../../lib/plugin-service';
import type { Plugin, PluginScope, PluginState } from '../../../lib/types';

function formatRelTime(ms: number | null): string {
  if (ms === null) return '—';
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function stateTone(state: PluginState): BadgeTone {
  switch (state) {
    case 'installed':
      return 'green';
    case 'available':
      return 'brand';
    case 'deprecated':
      return 'grey';
    case 'pending-approval':
      return 'yellow';
    default:
      return 'grey';
  }
}

export default function PluginDetailPage() {
  const params = useParams<{ id: string }>();
  const pluginId = params?.id ?? '';
  const [plugin, setPlugin] = useState<Plugin | null>(null);
  const [audit, setAudit] = useState<ReadonlyArray<PluginAuditEvent>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const backHref = adminConsole('plugins');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, log] = await Promise.all([getPlugin(pluginId), getPluginAuditLog(pluginId)]);
      setPlugin(p);
      setAudit(log);
      if (!p) setError(`Plugin ${pluginId} not found.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load plugin');
    } finally {
      setLoading(false);
    }
  }, [pluginId]);

  useEffect(() => {
    if (pluginId) loadData();
  }, [pluginId, loadData]);

  async function handleAction() {
    if (!plugin) return;
    setActionBusy(true);
    try {
      if (plugin.state === 'installed') {
        await disablePlugin(plugin.id);
      } else {
        await enablePlugin(plugin.id);
      }
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update plugin');
    } finally {
      setActionBusy(false);
    }
  }

  if (loading) {
    return (
      <div data-testid="plugin-detail-page" aria-busy>
        <div className="h-8 w-1/3 animate-pulse rounded bg-slate-200" />
        <div className="mt-4 h-4 w-1/2 animate-pulse rounded bg-slate-200" />
        <div className="mt-8 space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-slate-200" />
          ))}
        </div>
      </div>
    );
  }

  if (!plugin) {
    return (
      <div data-testid="plugin-detail-page">
        <Link
          href={backHref}
          className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-brand-700"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden />
          Back to plugins
        </Link>
        <div
          className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
          role="alert"
        >
          <strong className="font-semibold">Plugin not found.</strong> {error ?? ''}
        </div>
      </div>
    );
  }

  return (
    <div data-testid="plugin-detail-page">
      <Link
        href={backHref}
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-brand-700"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden />
        Back to plugins
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{plugin.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {plugin.publisher} · <code className="text-xs">v{plugin.version}</code>
          </p>
          <p className="mt-3 max-w-2xl text-sm text-slate-700">{plugin.description}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone={stateTone(plugin.state)}>{plugin.state}</Badge>
          <button
            type="button"
            disabled={actionBusy}
            onClick={handleAction}
            data-testid="plugin-detail-action"
            className={
              plugin.state === 'installed'
                ? 'inline-flex items-center gap-1 rounded-md bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:opacity-50'
                : 'inline-flex items-center gap-1 rounded-md bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 transition hover:bg-brand-100 disabled:opacity-50'
            }
          >
            {plugin.state === 'installed' ? (
              <>
                <ShieldOff className="h-3 w-3" aria-hidden />
                Disable
              </>
            ) : (
              <>
                <Plus className="h-3 w-3" aria-hidden />
                Enable
              </>
            )}
          </button>
        </div>
      </div>

      {plugin.deprecation_notice && (
        <div
          className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
          role="status"
        >
          <strong className="font-semibold">Deprecation notice.</strong> {plugin.deprecation_notice}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Metadata
          </h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">ID</dt>
              <dd className="font-mono text-xs text-slate-700">{plugin.id}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Installed by</dt>
              <dd className="text-slate-700">{plugin.installed_by ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Installed at</dt>
              <dd className="text-slate-700">{formatRelTime(plugin.installed_at_ms)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Last used</dt>
              <dd className="text-slate-700">{formatRelTime(plugin.last_used_at_ms)}</dd>
            </div>
          </dl>
        </section>

        <section
          className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2"
          data-testid="plugin-detail-scopes"
        >
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Requested scopes
          </h2>
          <div className="flex flex-wrap gap-2">
            {plugin.scopes.map((s: PluginScope) => (
              <Badge key={s} tone="grey">
                {SCOPE_LABELS[s]}
              </Badge>
            ))}
          </div>
        </section>
      </div>

      <section
        className="mt-6 rounded-xl border border-slate-200 bg-white p-5"
        data-testid="plugin-detail-audit"
      >
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Audit log
        </h2>
        {audit.length === 0 ? (
          <p className="text-sm text-slate-500">No audit events yet for this plugin.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {audit.map((ev, i) => (
              <li key={i} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <div className="font-medium text-slate-800">{ev.action}</div>
                  <div className="text-xs text-slate-500">{ev.actor}</div>
                </div>
                <div className="text-xs text-slate-500">{formatRelTime(ev.timestamp_ms)}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
