/**
 * SCIM admin page — Wave 8 §S8.1.
 *
 * Lists SCIM v2 bearer tokens, lets admins create new ones, and
 * reveals the secret once at creation time. Revocation requires
 * confirmation.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Copy, ShieldOff, Check } from 'lucide-react';
import {
  listSCIMTokens,
  createSCIMToken,
  revokeSCIMToken,
} from '../../lib/scim-service';
import type { SCIMToken, SCIMTokenCreateResult } from '../../lib/types';

function formatRelTime(ms: number | null): string {
  if (ms === null) return 'never';
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function formatAbsTime(ms: number | null): string {
  if (ms === null) return '—';
  return new Date(ms).toISOString().slice(0, 10);
}

interface CreatedSecret {
  id: string;
  secret: string;
}

export default function SCIMPage() {
  const [tokens, setTokens] = useState<ReadonlyArray<SCIMToken>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [createdSecret, setCreatedSecret] = useState<CreatedSecret | null>(null);
  const [copied, setCopied] = useState(false);
  const [tenantInput, setTenantInput] = useState('acme');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await listSCIMTokens();
      setTokens(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load SCIM tokens');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleCreate() {
    if (!tenantInput.trim()) return;
    setBusy('create');
    setError(null);
    try {
      const result: SCIMTokenCreateResult = await createSCIMToken({
        tenant_id: tenantInput.trim(),
      });
      setTokens((prev) => [result.token, ...prev]);
      setCreatedSecret({ id: result.token.id, secret: result.token_secret });
      setCopied(false);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create token');
    } finally {
      setBusy(null);
    }
  }

  async function handleRevoke(token: SCIMToken) {
    if (
      !window.confirm(
        `Revoke this SCIM token? Provisioning calls using it will fail.`,
      )
    ) {
      return;
    }
    setBusy(token.id);
    setError(null);
    try {
      await revokeSCIMToken(token.id);
      setTokens((prev) => prev.filter((t) => t.id !== token.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revoke');
    } finally {
      setBusy(null);
    }
  }

  async function handleCopy(secret: string) {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may not be available in tests
    }
  }

  return (
    <div data-testid="scim-page">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            SCIM Provisioning
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Generate SCIM tokens for automated user provisioning.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={tenantInput}
            onChange={(e) => setTenantInput(e.target.value)}
            placeholder="tenant"
            className="w-32 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <button
            type="button"
            disabled={busy === 'create'}
            onClick={handleCreate}
            data-testid="scim-token-new"
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Create token
          </button>
        </div>
      </div>

      {error && (
        <div
          className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
          role="alert"
        >
          <strong className="font-semibold">Error.</strong> {error}
        </div>
      )}

      {createdSecret && (
        <div
          className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4"
          data-testid={`scim-token-secret-${createdSecret.id}`}
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-amber-700">
            Token created. Copy it now — it will not be shown again:
          </div>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 break-all rounded-md bg-white px-2.5 py-1.5 text-xs text-slate-900 border border-amber-200">
              {createdSecret.secret}
            </code>
            <button
              type="button"
              onClick={() => void handleCopy(createdSecret.secret)}
              className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-200"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3" aria-hidden />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" aria-hidden />
                  Copy
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="space-y-2" aria-busy>
          {[0, 1].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-200" />
          ))}
        </div>
      )}

      {!loading && (
        <div
          className="overflow-hidden rounded-xl border border-slate-200 bg-white"
          data-testid="scim-token-list"
        >
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Tenant
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Endpoint
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Token
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Last used
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Expires
                </th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tokens.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-sm text-slate-500"
                  >
                    No SCIM tokens yet. Create one above.
                  </td>
                </tr>
              ) : (
                tokens.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                    <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-800">
                      {t.tenant_id}
                    </td>
                    <td className="px-4 py-2.5">
                      <code className="text-xs text-slate-600">{t.endpoint_url}</code>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
                        {t.token_prefix}…
                      </code>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">
                      {formatRelTime(t.last_used_at_ms)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">
                      {formatAbsTime(t.expires_at_ms)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      <button
                        type="button"
                        disabled={busy === t.id}
                        onClick={() => void handleRevoke(t)}
                        className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                      >
                        <ShieldOff className="h-3 w-3" aria-hidden />
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}