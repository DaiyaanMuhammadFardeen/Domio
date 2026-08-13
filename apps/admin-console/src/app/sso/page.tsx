/**
 * SSO admin page — Wave 8 §S8.1.
 *
 * Lets admins browse configured SAML/OIDC providers, edit one,
 * run a test login, or create a new provider from the SAML metadata
 * XML the IdP exposes.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge, toneForSSOProviderStatus } from '../../components/Badge';
import {
  listSSOProviders,
  createSSOProvider,
  deleteSSOProvider,
} from '../../lib/sso-service';
import type {
  SSOProvider,
  SSOProtocol,
  SSOTestLoginResult,
} from '../../lib/types';
import { ProviderConfig } from '../../components/sso/ProviderConfig';
import { TestLogin } from '../../components/sso/TestLogin';
import { MetadataImport } from '../../components/sso/MetadataImport';

function formatRelTime(ms: number | null): string {
  if (ms === null) return '—';
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

interface NewProviderForm {
  tenant_id: string;
  name: string;
  protocol: SSOProtocol;
  metadata_url: string;
}

const EMPTY_NEW_PROVIDER: NewProviderForm = {
  tenant_id: 'acme',
  name: '',
  protocol: 'saml',
  metadata_url: '',
};

export default function SSOPage() {
  const [providers, setProviders] = useState<ReadonlyArray<SSOProvider>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState<NewProviderForm>(EMPTY_NEW_PROVIDER);
  const [lastTest, setLastTest] = useState<SSOTestLoginResult | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await listSSOProviders();
      setProviders(items);
      if (items.length > 0 && !selectedId) {
        setSelectedId(items[0]?.id ?? null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load SSO providers');
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selected = providers.find((p) => p.id === selectedId) ?? null;

  async function handleSave(next: SSOProvider) {
    setProviders((prev) => prev.map((p) => (p.id === next.id ? next : p)));
  }

  async function handleDelete(id: string) {
    await deleteSSOProvider(id);
    setProviders((prev) => {
      const filtered = prev.filter((p) => p.id !== id);
      if (selectedId === id) {
        setSelectedId(filtered[0]?.id ?? null);
      }
      return filtered;
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) return;
    const created = await createSSOProvider({
      tenant_id: draft.tenant_id.trim(),
      name: draft.name.trim(),
      protocol: draft.protocol,
      metadata_url: draft.metadata_url.trim() || null,
    });
    setProviders((prev) => [...prev, created]);
    setSelectedId(created.id);
    setShowNew(false);
    setDraft(EMPTY_NEW_PROVIDER);
  }

  function handleMetadataImport(parsed: {
    entity_id: string;
    acs_url: string;
    raw_xml: string;
  }) {
    // Auto-fill the new-provider form with the parsed entity_id (the
    // tenant_id is left to the admin).
    setDraft((prev) => ({
      ...prev,
      name: prev.name.trim() || parsed.entity_id.split(':').pop() || 'New IdP',
      metadata_url: parsed.raw_xml.slice(0, 0) + parsed.entity_id,
    }));
    setShowNew(true);
  }

  return (
    <div data-testid="sso-page">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Single Sign-On
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Configure SAML and OIDC identity providers for this workspace.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNew((v) => !v)}
          data-testid="sso-provider-new"
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {showNew ? 'Cancel' : 'New Provider'}
        </button>
      </div>

      {error && (
        <div
          className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
          role="alert"
        >
          <strong className="font-semibold">Error.</strong> {error}
        </div>
      )}

      {showNew && (
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          <form
            onSubmit={handleCreate}
            className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h3 className="text-sm font-semibold text-slate-900">Create provider</h3>
            <div>
              <label className="block text-xs font-medium text-slate-600" htmlFor="np-tenant">
                Tenant
              </label>
              <input
                id="np-tenant"
                type="text"
                value={draft.tenant_id}
                onChange={(e) => setDraft((d) => ({ ...d, tenant_id: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600" htmlFor="np-name">
                Display name
              </label>
              <input
                id="np-name"
                type="text"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Okta"
                className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <span className="block text-xs font-medium text-slate-600">Protocol</span>
              <div className="mt-1 flex items-center gap-4">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="np-protocol"
                    value="saml"
                    checked={draft.protocol === 'saml'}
                    onChange={() => setDraft((d) => ({ ...d, protocol: 'saml' }))}
                    className="h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  SAML
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="np-protocol"
                    value="oidc"
                    checked={draft.protocol === 'oidc'}
                    onChange={() => setDraft((d) => ({ ...d, protocol: 'oidc' }))}
                    className="h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  OIDC
                </label>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600" htmlFor="np-mu">
                Metadata URL <span className="text-slate-400">(optional)</span>
              </label>
              <input
                id="np-mu"
                type="text"
                value={draft.metadata_url}
                onChange={(e) => setDraft((d) => ({ ...d, metadata_url: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center rounded-md bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-700"
              >
                Create
              </button>
            </div>
          </form>
          <MetadataImport onImport={handleMetadataImport} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div
          className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
          data-testid="sso-provider-list"
        >
          <div className="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Providers
          </div>
          {loading && (
            <div className="space-y-2" aria-busy>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-md bg-slate-200" />
              ))}
            </div>
          )}
          {!loading && providers.length === 0 && (
            <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-500">
              No SSO providers configured yet.
            </div>
          )}
          <ul className="space-y-1">
            {providers.map((p) => {
              const active = p.id === selectedId;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition ${
                      active
                        ? 'bg-brand-50 text-brand-800'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-[11px] text-slate-500">
                        {p.protocol.toUpperCase()} · {p.tenant_id}
                      </div>
                    </div>
                    <Badge tone={toneForSSOProviderStatus(p.status)}>{p.status}</Badge>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="lg:col-span-2">
          {selected ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <Badge tone={toneForSSOProviderStatus(selected.status)}>
                  {selected.status}
                </Badge>
                <span>Last sync: {formatRelTime(selected.last_sync_at_ms)}</span>
                <span>Errors (24h): {selected.error_count_24h}</span>
                <span className="font-mono text-[11px] text-slate-400">
                  {selected.entity_id}
                </span>
              </div>
              <ProviderConfig
                provider={selected}
                onSave={handleSave}
                onDelete={handleDelete}
              />
              <TestLogin provider={selected} onResult={setLastTest} />
              {lastTest && (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  Last test login: {lastTest.ok ? 'OK' : 'FAILED'} at{' '}
                  {lastTest.latency_ms} ms
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              Select a provider on the left to edit, or click{' '}
              <strong>New Provider</strong> above.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}