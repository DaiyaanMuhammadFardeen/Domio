/**
 * Plugin administration page — Wave 8 §S8.9.
 *
 * Tabs:
 *   - Installed      : plugins with state='installed'; per-row Disable button.
 *   - Available      : marketplace catalogue (state='available'); Enable button.
 *   - Deprecated     : previously installed plugins in state='deprecated'.
 *   - Pending Approval : publish requests waiting for review.
 *
 * State is held in the plugin-service seed; mutation calls go through
 * enablePlugin / disablePlugin / approvePublishRequest /
 * rejectPublishRequest.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, ShieldOff, Plus, X } from 'lucide-react';
import { clsx } from 'clsx';
import { adminConsole } from '@domio/ui';
import { Badge, type BadgeTone } from '../../components/Badge';
import {
  approvePublishRequest,
  disablePlugin,
  enablePlugin,
  listPlugins,
  listPublishRequests,
  PLUGIN_STATE_TONES,
  rejectPublishRequest,
  SCOPE_LABELS,
} from '../../lib/plugin-service';
import type { Plugin, PluginPublishRequest, PluginScope, PluginState } from '../../lib/types';

type TabKey = 'installed' | 'available' | 'deprecated' | 'pending';

interface TabDef {
  readonly key: TabKey;
  readonly label: string;
  readonly testid: string;
  readonly state?: PluginState;
}

const TABS: ReadonlyArray<TabDef> = [
  { key: 'installed', label: 'Installed', testid: 'plugins-tab-installed', state: 'installed' },
  { key: 'available', label: 'Available', testid: 'plugins-tab-available', state: 'available' },
  { key: 'deprecated', label: 'Deprecated', testid: 'plugins-tab-deprecated', state: 'deprecated' },
  { key: 'pending', label: 'Pending Approval', testid: 'plugins-tab-pending' },
];

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

function requestTone(status: PluginPublishRequest['status']): BadgeTone {
  switch (status) {
    case 'pending':
      return 'yellow';
    case 'approved':
      return 'green';
    case 'rejected':
      return 'red';
    default:
      return 'grey';
  }
}

export default function PluginsPage() {
  const [tab, setTab] = useState<TabKey>('installed');
  const [plugins, setPlugins] = useState<ReadonlyArray<Plugin>>([]);
  const [requests, setRequests] = useState<ReadonlyArray<PluginPublishRequest>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [allPlugins, reqs] = await Promise.all([listPlugins(), listPublishRequests()]);
      setPlugins(allPlugins);
      setRequests(reqs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load plugins');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleEnable(id: string) {
    setActionBusy(id);
    try {
      await enablePlugin(id);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to enable plugin');
    } finally {
      setActionBusy(null);
    }
  }

  async function handleDisable(id: string) {
    setActionBusy(id);
    try {
      await disablePlugin(id);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to disable plugin');
    } finally {
      setActionBusy(null);
    }
  }

  async function handleApprove(reqId: string) {
    setActionBusy(reqId);
    try {
      await approvePublishRequest(reqId, 'Approved via admin console.');
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to approve request');
    } finally {
      setActionBusy(null);
    }
  }

  async function handleReject(reqId: string) {
    setActionBusy(reqId);
    try {
      await rejectPublishRequest(reqId, 'Rejected via admin console.');
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reject request');
    } finally {
      setActionBusy(null);
    }
  }

  const activeTab = TABS.find((t) => t.key === tab) ?? TABS[0]!;
  const filteredPlugins = tab !== 'pending' ? plugins.filter((p) => p.state === activeTab.state) : [];
  const pendingRequests = tab === 'pending' ? requests.filter((r) => r.status === 'pending') : [];

  return (
    <div data-testid="plugins-page">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Plugins</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage installed plugins, browse the marketplace, and review publish requests.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              data-testid={t.testid}
              onClick={() => setTab(t.key)}
              className={clsx(
                'rounded-t-md px-4 py-2 text-sm font-medium transition',
                active
                  ? 'border-b-2 border-brand-500 text-brand-700'
                  : 'text-slate-600 hover:text-slate-900',
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div
          className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
          role="alert"
        >
          <strong className="font-semibold">Error.</strong> {error}
        </div>
      )}

      {loading && (
        <div className="space-y-2" aria-busy>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-200" />
          ))}
        </div>
      )}

      {!loading && tab !== 'pending' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {filteredPlugins.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-slate-500">
              No plugins in this state.
            </div>
          ) : (
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Plugin
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Publisher
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Version
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Scopes
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    State
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPlugins.map((plugin) => {
                  const busy = actionBusy === plugin.id;
                  return (
                    <tr
                      key={plugin.id}
                      data-testid={`plugin-row-${plugin.id}`}
                      className="hover:bg-slate-50"
                    >
                      <td className="px-4 py-2.5">
                        <Link
                          href={adminConsole('plugin-detail', { id: plugin.id })}
                          data-testid={`plugin-detail-${plugin.id}`}
                          className="font-medium text-slate-900 hover:text-brand-700"
                        >
                          {plugin.name}
                        </Link>
                        <div className="mt-0.5 text-xs text-slate-500">{plugin.description}</div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-700">{plugin.publisher}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-700">
                        <code className="text-xs">v{plugin.version}</code>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {plugin.scopes.map((s: PluginScope) => (
                            <Badge key={s} tone="grey">
                              {SCOPE_LABELS[s]}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <Badge tone={stateTone(plugin.state)}>{PLUGIN_STATE_TONES[plugin.state] ? plugin.state : plugin.state}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">
                        {plugin.state === 'installed' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleDisable(plugin.id)}
                            data-testid={`plugin-disable-${plugin.id}`}
                            className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                          >
                            <ShieldOff className="h-3 w-3" aria-hidden />
                            Disable
                          </button>
                        )}
                        {plugin.state === 'available' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleEnable(plugin.id)}
                            data-testid={`plugin-enable-${plugin.id}`}
                            className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 transition hover:bg-brand-100 disabled:opacity-50"
                          >
                            <Plus className="h-3 w-3" aria-hidden />
                            Enable
                          </button>
                        )}
                        {plugin.state === 'deprecated' && (
                          <Link
                            href={adminConsole('plugin-detail', { id: plugin.id })}
                            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-brand-700"
                          >
                            View details →
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === 'pending' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {pendingRequests.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-slate-500">
              No publish requests waiting for review.
            </div>
          ) : (
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Plugin
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Publisher
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Scopes
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Submitted
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendingRequests.map((req) => {
                  const busy = actionBusy === req.id;
                  return (
                    <tr key={req.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-slate-900">{req.plugin_name}</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          Submitted {formatRelTime(req.submitted_at_ms)}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-700">{req.publisher}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {req.requested_scopes.map((s) => (
                            <Badge key={s} tone="amber">
                              {SCOPE_LABELS[s]}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <Badge tone={requestTone(req.status)}>{req.status}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleApprove(req.id)}
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                          >
                            <Check className="h-3 w-3" aria-hidden />
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleReject(req.id)}
                            className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                          >
                            <X className="h-3 w-3" aria-hidden />
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
