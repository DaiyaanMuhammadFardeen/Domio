'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { SSOProvider, SSORoleMapping, SSOProtocol } from '../../lib/types';

export interface ProviderConfigProps {
  provider: SSOProvider;
  onSave: (next: SSOProvider) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

interface FormState {
  name: string;
  protocol: SSOProtocol;
  metadata_url: string;
  role_mapping: ReadonlyArray<SSORoleMapping>;
}

/**
 * Provider config form. Edits the supplied `provider` and emits the
 * full updated record via `onSave`. Delete is a two-step confirm.
 *
 * Per Wave 8 §S8.1 of docs/frontend-roadmap/08-wave-enterprise.md.
 */
export function ProviderConfig({ provider, onSave, onDelete }: ProviderConfigProps) {
  const [form, setForm] = useState<FormState>({
    name: provider.name,
    protocol: provider.protocol,
    metadata_url: provider.metadata_url ?? '',
    role_mapping: provider.role_mapping,
  });
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateRole(index: number, field: keyof SSORoleMapping, value: string) {
    setForm((prev) => ({
      ...prev,
      role_mapping: prev.role_mapping.map((r, i) =>
        i === index ? { ...r, [field]: value } : r,
      ),
    }));
  }

  function addRole() {
    setForm((prev) => ({
      ...prev,
      role_mapping: [...prev.role_mapping, { sso_role: '', domio_role: '' }],
    }));
  }

  function removeRole(index: number) {
    setForm((prev) => ({
      ...prev,
      role_mapping: prev.role_mapping.filter((_, i) => i !== index),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const next: SSOProvider = {
        ...provider,
        name: form.name.trim() || provider.name,
        protocol: form.protocol,
        metadata_url: form.metadata_url.trim() || null,
        role_mapping: form.role_mapping.filter(
          (r) => r.sso_role.trim() && r.domio_role.trim(),
        ),
      };
      await onSave(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save provider');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      await onDelete(provider.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete provider');
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      data-testid="provider-config"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Provider
          </div>
          <h2 className="text-lg font-semibold text-slate-900">{provider.name}</h2>
          <p className="text-xs text-slate-500">
            <code className="text-[11px]">{provider.id}</code> · tenant{' '}
            <code className="text-[11px]">{provider.tenant_id}</code>
          </p>
        </div>
        <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-mono text-slate-600">
          {provider.entity_id}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="provider-name"
            className="block text-xs font-medium text-slate-600"
          >
            Display name
          </label>
          <input
            id="provider-name"
            data-testid="provider-name"
            type="text"
            value={form.name}
            onChange={(e) => patch('name', e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div>
          <span className="block text-xs font-medium text-slate-600">Protocol</span>
          <div className="mt-1 flex items-center gap-4">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                data-testid="provider-protocol-saml"
                type="radio"
                name="protocol"
                value="saml"
                checked={form.protocol === 'saml'}
                onChange={() => patch('protocol', 'saml')}
                className="h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              SAML
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                data-testid="provider-protocol-oidc"
                type="radio"
                name="protocol"
                value="oidc"
                checked={form.protocol === 'oidc'}
                onChange={() => patch('protocol', 'oidc')}
                className="h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              OIDC
            </label>
          </div>
        </div>
      </div>

      <div>
        <label
          htmlFor="provider-metadata-url"
          className="block text-xs font-medium text-slate-600"
        >
          Metadata URL <span className="text-slate-400">(optional)</span>
        </label>
        <input
          id="provider-metadata-url"
          data-testid="provider-metadata-url"
          type="text"
          value={form.metadata_url}
          onChange={(e) => patch('metadata_url', e.target.value)}
          placeholder="https://idp.example.com/metadata"
          className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-600">Role mapping</span>
          <button
            type="button"
            onClick={addRole}
            data-testid="provider-role-mapping-add"
            className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-200"
          >
            + Add role
          </button>
        </div>
        {form.role_mapping.length === 0 ? (
          <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-500">
            No role mappings yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {form.role_mapping.map((r, i) => (
              <li
                key={i}
                className="flex items-center gap-2 rounded-md border border-slate-200 p-2"
              >
                <input
                  type="text"
                  value={r.sso_role}
                  onChange={(e) => updateRole(i, 'sso_role', e.target.value)}
                  placeholder="sso_role"
                  className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs"
                />
                <span className="text-slate-400">→</span>
                <input
                  type="text"
                  value={r.domio_role}
                  onChange={(e) => updateRole(i, 'domio_role', e.target.value)}
                  placeholder="domio_role"
                  className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  onClick={() => removeRole(i)}
                  data-testid={`provider-role-mapping-remove-${i}`}
                  className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-700 transition hover:bg-rose-100"
                  aria-label="Remove mapping"
                >
                  <Trash2 className="h-3 w-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <div
          className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700"
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-slate-200 pt-4">
        <div>
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-600">Are you sure?</span>
              <button
                type="button"
                onClick={handleDelete}
                disabled={busy}
                data-testid="provider-delete"
                className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
              >
                Yes, delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={busy}
                className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-200"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100"
            >
              <Trash2 className="h-3 w-3" aria-hidden />
              Delete
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={busy}
          data-testid="provider-save"
          className="inline-flex items-center rounded-md bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}