/**
 * API Keys admin page — Wave 8 §S8.8.
 *
 * Lists every minted API key, lets the operator create new keys (with
 * a one-time secret banner on creation), and revoke active keys.
 * Backed by `api-key-service.ts` which currently seeds 4 keys with
 * mixed scopes / lifetime / revoked state.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Plus, X } from 'lucide-react';
import { FormattedMessage } from '@domio/ui';
import enMessages from '../../../messages/en.json';
import { Badge } from '../../components/Badge';
import {
  API_KEY_SCOPES,
  createAPIKey,
  listAPIKeys,
  revokeAPIKey,
} from '../../lib/api-key-service';
import type { APIKey, APIKeyInput, APIKeyScope } from '../../lib/types';

const CATALOGUE = enMessages as Readonly<Record<string, string>>;

function formatDate(ms: number | null): string {
  if (ms === null) return '—';
  return new Date(ms).toISOString().slice(0, 10);
}

function formatRelTime(ms: number | null): string {
  if (ms === null) return '—';
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function toneForScope(scope: APIKeyScope): 'green' | 'brand' | 'amber' | 'red' | 'grey' {
  switch (scope) {
    case 'read-only':
      return 'green';
    case 'read-write':
      return 'brand';
    case 'agent-only':
      return 'amber';
    case 'admin':
      return 'red';
    case 'export':
      return 'amber';
  }
}

export default function APIKeysPage() {
  const [keys, setKeys] = useState<ReadonlyArray<APIKey>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<ReadonlyArray<APIKeyScope>>([]);
  const [expiryDays, setExpiryDays] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [secretBanner, setSecretBanner] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await listAPIKeys();
      setKeys(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function toggleScope(scope: APIKeyScope) {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (scopes.length === 0) {
      setError('Pick at least one scope');
      return;
    }
    const days = Number.parseInt(expiryDays, 10);
    const input: APIKeyInput = {
      name: name.trim(),
      scopes,
      ...(Number.isFinite(days) && days > 0
        ? {
            expires_at_ms:
              Date.now() + days * 1000 * 60 * 60 * 24,
          }
        : {}),
    };
    setSubmitting(true);
    try {
      const result = await createAPIKey(input);
      setSecretBanner(result.secret);
      setName('');
      setScopes([]);
      setExpiryDays('');
      setCreating(false);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create key');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(id: string) {
    try {
      await revokeAPIKey(id);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revoke key');
    }
  }

  async function handleCopy(secret: string) {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(secret);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // clipboard write may fail in jsdom tests; ignore
    }
  }

  return (
    <div data-testid="api-keys-page" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            <FormattedMessage id="admin.apiKeys.heading" catalogue={CATALOGUE} />
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            <FormattedMessage
              id="admin.apiKeys.subheading"
              catalogue={CATALOGUE}
            />
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          data-testid="api-keys-new"
          className="inline-flex items-center gap-1.5 self-start rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700"
        >
          {creating ? (
            <X className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Plus className="h-3.5 w-3.5" aria-hidden />
          )}
          <FormattedMessage id="admin.apiKeys.newKey" catalogue={CATALOGUE} />
        </button>
      </div>

      {secretBanner && (
        <div
          data-testid="api-keys-secret-banner"
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4"
        >
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
            <FormattedMessage
              id="admin.apiKeys.secretBanner"
              catalogue={CATALOGUE}
            />
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-md bg-white px-3 py-2 font-mono text-xs text-amber-900">
              {secretBanner}
            </code>
            <button
              type="button"
              onClick={() => void handleCopy(secretBanner)}
              className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2 py-1.5 text-xs font-medium text-amber-800 transition hover:bg-amber-100"
            >
              <Copy className="h-3 w-3" aria-hidden />
              {copied ? 'Copied' : <FormattedMessage id="admin.apiKeys.copy" catalogue={CATALOGUE} />}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setSecretBanner(null)}
            className="mt-2 text-xs text-amber-700 underline hover:text-amber-900"
          >
            Dismiss
          </button>
        </div>
      )}

      {creating && (
        <form
          onSubmit={handleCreate}
          data-testid="api-keys-form"
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-600">
            Create API key
          </h3>
          <div className="space-y-4">
            <label className="block">
              <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                <FormattedMessage
                  id="admin.apiKeys.col.name"
                  catalogue={CATALOGUE}
                />
              </span>
              <input
                data-testid="api-keys-form-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="e.g. CI deploy bot"
              />
            </label>

            <fieldset>
              <legend className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                <FormattedMessage
                  id="admin.apiKeys.col.scopes"
                  catalogue={CATALOGUE}
                />
              </legend>
              <div
                data-testid="api-keys-form-scopes"
                className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3"
              >
                {API_KEY_SCOPES.map((scope) => (
                  <label
                    key={scope}
                    className="inline-flex items-center gap-2 text-sm text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={scopes.includes(scope)}
                      onChange={() => toggleScope(scope)}
                      className="h-3.5 w-3.5 accent-brand-600"
                      data-testid={`api-keys-form-scope-${scope}`}
                    />
                    <Badge tone={toneForScope(scope)}>{scope}</Badge>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="block max-w-xs">
              <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                <FormattedMessage
                  id="admin.apiKeys.col.expires"
                  catalogue={CATALOGUE}
                />
                {' '}(
                days, optional)
              </span>
              <input
                type="number"
                min={1}
                max={3650}
                value={expiryDays}
                onChange={(e) => setExpiryDays(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="365"
              />
            </label>
          </div>

          {error && (
            <div
              className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
              role="alert"
            >
              {error}
            </div>
          )}

          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              data-testid="api-keys-form-submit"
              className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create key'}
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
          data-testid="api-keys-list"
          className="overflow-hidden rounded-xl border border-slate-200 bg-white"
        >
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <FormattedMessage
                      id="admin.apiKeys.col.name"
                      catalogue={CATALOGUE}
                    />
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <FormattedMessage
                      id="admin.apiKeys.col.scopes"
                      catalogue={CATALOGUE}
                    />
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <FormattedMessage
                      id="admin.apiKeys.col.prefix"
                      catalogue={CATALOGUE}
                    />
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <FormattedMessage
                      id="admin.apiKeys.col.lastUsed"
                      catalogue={CATALOGUE}
                    />
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <FormattedMessage
                      id="admin.apiKeys.col.expires"
                      catalogue={CATALOGUE}
                    />
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <FormattedMessage
                      id="admin.apiKeys.col.created"
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
                {keys.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-12 text-center text-sm text-slate-500"
                    >
                      No API keys yet.
                    </td>
                  </tr>
                ) : (
                  keys.map((k) => (
                    <tr
                      key={k.id}
                      data-testid={`api-keys-row-${k.id}`}
                      className="transition-colors hover:bg-slate-50"
                    >
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-800">
                        <div className="font-medium">{k.name}</div>
                        <div className="font-mono text-[11px] text-slate-400">
                          {k.id}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {k.scopes.map((s) => (
                            <Badge key={s} tone={toneForScope(s)}>
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-slate-700">
                        {k.prefix}…
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-600">
                        {formatRelTime(k.last_used_at_ms)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-600">
                        {formatDate(k.expires_at_ms)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-600">
                        {formatDate(k.created_at_ms)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => void handleRevoke(k.id)}
                          data-testid={`api-keys-revoke-${k.id}`}
                          className="rounded-md border border-rose-200 bg-white px-2 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-50"
                        >
                          <FormattedMessage
                            id="admin.apiKeys.revoke"
                            catalogue={CATALOGUE}
                          />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
