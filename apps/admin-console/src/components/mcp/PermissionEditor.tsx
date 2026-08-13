'use client';

/**
 * PermissionEditor — Wave 10 §S10.1.
 *
 * Inline toggle group for an agent's MCP scopes. Saves via the supplied
 * `onSave` callback when the operator clicks "Save". The host page owns
 * the actual mutation — this component is a controlled form.
 */

import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import type { MCPAgentPermission } from '../../lib/mcp-service';

export const MCP_SCOPES: ReadonlyArray<{
  value: string;
  label: string;
  description: string;
}> = [
  {
    value: 'this-deck-only',
    label: 'This deck only',
    description: 'Restrict to the deck currently being edited.',
  },
  {
    value: 'read-only',
    label: 'Read-only',
    description: 'Allow reads but no writes.',
  },
  {
    value: 'data-binding-only',
    label: 'Data binding only',
    description: 'Only touch data-binding slots.',
  },
  {
    value: 'no-brand-locked-regions',
    label: 'No brand-locked regions',
    description: 'Refuse to operate in brand-locked regions.',
  },
];

export interface PermissionEditorProps {
  agent: MCPAgentPermission;
  onSave: (next: MCPAgentPermission) => Promise<void> | void;
  onCancel?: () => void;
  /** When true, disable the form (e.g. while a request is in flight). */
  busy?: boolean;
}

export function PermissionEditor({
  agent,
  onSave,
  onCancel,
  busy = false,
}: PermissionEditorProps) {
  const [scopes, setScopes] = useState<string[]>(agent.scopes.slice());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resync local state when the agent prop changes (e.g. drawer opens).
  useEffect(() => {
    setScopes(agent.scopes.slice());
    setError(null);
  }, [agent]);

  function toggleScope(scope: string) {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({ ...agent, scopes: scopes.slice() });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save scopes');
    } finally {
      setSaving(false);
    }
  }

  const disabled = busy || saving;

  return (
    <form
      data-testid={`mcp-permission-editor-${agent.agent_id}`}
      onSubmit={handleSave}
      className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
    >
      <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
        Edit scopes for {agent.agent_name}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {MCP_SCOPES.map((scope) => {
          const active = scopes.includes(scope.value);
          return (
            <label
              key={scope.value}
              className={clsx(
                'flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-1.5 text-sm transition',
                active
                  ? 'border-brand-400 bg-brand-50'
                  : 'border-slate-200 bg-white hover:bg-slate-50',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              <input
                type="checkbox"
                className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                checked={active}
                onChange={() => toggleScope(scope.value)}
                disabled={disabled}
              />
              <span className="flex flex-col">
                <span className="font-medium text-slate-800">{scope.label}</span>
                <span className="text-[11px] leading-snug text-slate-500">
                  {scope.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700"
        >
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={disabled}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          data-testid={`mcp-permission-save-${agent.agent_id}`}
          disabled={disabled}
          className="rounded-md border border-brand-600 bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save scopes'}
        </button>
      </div>
    </form>
  );
}
