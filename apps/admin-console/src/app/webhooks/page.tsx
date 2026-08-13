/**
 * Webhooks admin page — Wave 8 §S8.8.
 *
 * Lists every webhook subscription, lets the operator create new
 * subscriptions, edit existing ones, rotate the signing secret, and
 * delete subscriptions. Each row expands to show recent delivery
 * attempts. Backed by `webhook-service.ts`.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import { FormattedMessage } from '@domio/ui';
import enMessages from '../../../messages/en.json';
import { Badge } from '../../components/Badge';
import {
  WEBHOOK_EVENT_TYPES,
  createWebhook,
  deleteWebhook,
  listDeliveries,
  listWebhooks,
  rotateSecret,
  updateWebhook,
} from '../../lib/webhook-service';
import type {
  Webhook,
  WebhookDelivery,
  WebhookEventType,
  WebhookInput,
} from '../../lib/types';

const CATALOGUE = enMessages as Readonly<Record<string, string>>;

const DEFAULT_RETRY: ReadonlyArray<number> = [1, 3, 5, 8];
const DEFAULT_BACKOFF: ReadonlyArray<number> = [10, 30, 60, 120];

function formatDate(ms: number | null): string {
  if (ms === null) return '—';
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
}

function formatRelTime(ms: number | null): string {
  if (ms === null) return '—';
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function toneForStatus(code: number | null): 'green' | 'amber' | 'red' | 'grey' {
  if (code === null) return 'grey';
  if (code >= 200 && code < 300) return 'green';
  if (code >= 400 && code < 500) return 'amber';
  return 'red';
}

interface WebhookFormState {
  readonly url: string;
  readonly events: ReadonlyArray<WebhookEventType>;
  readonly maxRetries: number;
  readonly backoffSeconds: number;
}

const EMPTY_FORM: WebhookFormState = {
  url: '',
  events: [],
  maxRetries: 3,
  backoffSeconds: 30,
};

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<ReadonlyArray<Webhook>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<WebhookFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<ReadonlyArray<WebhookDelivery>>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await listWebhooks();
      setWebhooks(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load webhooks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function toggleFormEvent(event: WebhookEventType) {
    setForm((prev) => ({
      ...prev,
      events: prev.events.includes(event)
        ? prev.events.filter((e) => e !== event)
        : [...prev.events, event],
    }));
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.url.trim()) {
      setError('URL is required');
      return;
    }
    if (form.events.length === 0) {
      setError('Pick at least one event');
      return;
    }
    const input: WebhookInput = {
      url: form.url.trim(),
      events: form.events,
      retry_policy: {
        max_retries: form.maxRetries,
        backoff_seconds: form.backoffSeconds,
      },
    };
    setSubmitting(true);
    try {
      if (editingId) {
        await updateWebhook(editingId, input);
      } else {
        await createWebhook(input);
      }
      resetForm();
      setCreating(false);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save webhook');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRotate(id: string) {
    try {
      await rotateSecret(id);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to rotate secret');
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this webhook?')) return;
    try {
      await deleteWebhook(id);
      if (expandedId === id) setExpandedId(null);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete webhook');
    }
  }

  function startEdit(wh: Webhook) {
    setCreating(false);
    setEditingId(wh.id);
    setForm({
      url: wh.url,
      events: wh.events,
      maxRetries: wh.retry_policy.max_retries,
      backoffSeconds: wh.retry_policy.backoff_seconds,
    });
  }

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setDeliveries([]);
      return;
    }
    setExpandedId(id);
    setLoadingDeliveries(true);
    try {
      const items = await listDeliveries(id);
      setDeliveries(items);
    } catch {
      setDeliveries([]);
    } finally {
      setLoadingDeliveries(false);
    }
  }

  const formOpen = creating || editingId !== null;

  return (
    <div data-testid="webhooks-page" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            <FormattedMessage id="admin.webhooks.heading" catalogue={CATALOGUE} />
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            <FormattedMessage
              id="admin.webhooks.subheading"
              catalogue={CATALOGUE}
            />
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (creating) {
              setCreating(false);
              resetForm();
            } else {
              setEditingId(null);
              setCreating(true);
              resetForm();
            }
          }}
          data-testid="webhooks-new"
          className="inline-flex items-center gap-1.5 self-start rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700"
        >
          {creating ? (
            <X className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Plus className="h-3.5 w-3.5" aria-hidden />
          )}
          <FormattedMessage
            id="admin.webhooks.newWebhook"
            catalogue={CATALOGUE}
          />
        </button>
      </div>

      {error && (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
          role="alert"
        >
          <strong className="font-semibold">Error.</strong> {error}
        </div>
      )}

      {formOpen && (
        <form
          onSubmit={handleSubmit}
          data-testid="webhooks-form"
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-600">
            {editingId ? 'Edit webhook' : 'New webhook'}
          </h3>

          <div className="space-y-4">
            <label className="block">
              <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                <FormattedMessage id="admin.webhooks.col.url" catalogue={CATALOGUE} />
              </span>
              <input
                type="url"
                value={form.url}
                onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))}
                placeholder="https://hooks.example.com/domio"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                data-testid="webhooks-form-url"
              />
            </label>

            <fieldset>
              <legend className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                <FormattedMessage
                  id="admin.webhooks.col.events"
                  catalogue={CATALOGUE}
                />
              </legend>
              <div
                className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3"
                data-testid="webhooks-form-events"
              >
                {WEBHOOK_EVENT_TYPES.map((evt) => (
                  <label
                    key={evt}
                    className="inline-flex items-center gap-2 text-sm text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={form.events.includes(evt)}
                      onChange={() => toggleFormEvent(evt)}
                      className="h-3.5 w-3.5 accent-brand-600"
                      data-testid={`webhooks-form-event-${evt}`}
                    />
                    <span className="font-mono text-xs">{evt}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Max retries
                </span>
                <select
                  value={form.maxRetries}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      maxRetries: Number.parseInt(e.target.value, 10),
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  data-testid="webhooks-form-retries"
                >
                  {DEFAULT_RETRY.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Backoff (seconds)
                </span>
                <select
                  value={form.backoffSeconds}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      backoffSeconds: Number.parseInt(e.target.value, 10),
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  data-testid="webhooks-form-backoff"
                >
                  {DEFAULT_BACKOFF.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                resetForm();
              }}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              data-testid="webhooks-form-submit"
              className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? 'Saving…' : editingId ? 'Save changes' : 'Create webhook'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="space-y-2" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-200" />
          ))}
        </div>
      ) : (
        <div
          data-testid="webhooks-list"
          className="overflow-hidden rounded-xl border border-slate-200 bg-white"
        >
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <FormattedMessage id="admin.webhooks.col.url" catalogue={CATALOGUE} />
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <FormattedMessage
                      id="admin.webhooks.col.events"
                      catalogue={CATALOGUE}
                    />
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <FormattedMessage
                      id="admin.webhooks.col.lastDelivery"
                      catalogue={CATALOGUE}
                    />
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <FormattedMessage
                      id="admin.webhooks.col.enabled"
                      catalogue={CATALOGUE}
                    />
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <FormattedMessage
                      id="admin.apiKeys.col.actions"
                      catalogue={CATALOGUE}
                    />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {webhooks.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-12 text-center text-sm text-slate-500"
                    >
                      No webhooks configured yet.
                    </td>
                  </tr>
                ) : (
                  webhooks.map((wh) => {
                    const expanded = expandedId === wh.id;
                    return (
                      <>
                        <tr
                          key={wh.id}
                          data-testid={`webhook-row-${wh.id}`}
                          className="transition-colors hover:bg-slate-50"
                        >
                          <td className="max-w-md px-4 py-2.5 text-slate-800">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => void toggleExpand(wh.id)}
                                aria-label={expanded ? 'Collapse' : 'Expand'}
                                className="rounded-md p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                              >
                                {expanded ? (
                                  <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                                )}
                              </button>
                              <div className="min-w-0">
                                <div className="truncate font-mono text-xs">{wh.url}</div>
                                <div className="font-mono text-[11px] text-slate-400">
                                  {wh.id}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              <Badge tone="brand">{wh.events.length}</Badge>
                              {wh.events.slice(0, 2).map((e) => (
                                <span
                                  key={e}
                                  className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-700"
                                >
                                  {e}
                                </span>
                              ))}
                              {wh.events.length > 2 && (
                                <span className="text-[10px] text-slate-400">
                                  +{wh.events.length - 2} more
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-600">
                            <div className="flex items-center gap-2">
                              <Badge tone={toneForStatus(wh.last_delivery_status)}>
                                {wh.last_delivery_status ?? '—'}
                              </Badge>
                              <span>{formatRelTime(wh.last_delivery_at_ms)}</span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-xs">
                            <Badge tone={wh.enabled ? 'green' : 'grey'}>
                              {wh.enabled ? 'on' : 'off'}
                            </Badge>
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right">
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => startEdit(wh)}
                                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleRotate(wh.id)}
                                data-testid={`webhook-rotate-${wh.id}`}
                                className="rounded-md border border-amber-200 bg-white px-2 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-50"
                              >
                                <FormattedMessage
                                  id="admin.webhooks.rotate"
                                  catalogue={CATALOGUE}
                                />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDelete(wh.id)}
                                data-testid={`webhook-delete-${wh.id}`}
                                className="rounded-md border border-rose-200 bg-white px-2 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-50"
                              >
                                <FormattedMessage
                                  id="admin.webhooks.delete"
                                  catalogue={CATALOGUE}
                                />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expanded && (
                          <tr
                            key={`${wh.id}-deliveries`}
                            data-testid={`webhook-deliveries-${wh.id}`}
                            className="bg-slate-50"
                          >
                            <td colSpan={5} className="px-4 py-3">
                              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                                <FormattedMessage
                                  id="admin.webhooks.deliveries"
                                  catalogue={CATALOGUE}
                                />
                              </div>
                              {loadingDeliveries ? (
                                <div className="text-xs text-slate-500">Loading…</div>
                              ) : deliveries.length === 0 ? (
                                <div className="text-xs text-slate-500">
                                  No deliveries yet.
                                </div>
                              ) : (
                                <ul className="space-y-1">
                                  {deliveries.map((d) => (
                                    <li
                                      key={d.id}
                                      className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-1.5 text-xs text-slate-700"
                                    >
                                      <div className="flex items-center gap-2">
                                        <Badge tone={toneForStatus(d.status_code)}>
                                          {d.status_code ?? '—'}
                                        </Badge>
                                        <span className="font-mono">{d.event}</span>
                                        <span className="text-slate-400">
                                          attempt {d.attempt}
                                        </span>
                                      </div>
                                      <span className="text-slate-500">
                                        {formatDate(d.delivered_at_ms)}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
