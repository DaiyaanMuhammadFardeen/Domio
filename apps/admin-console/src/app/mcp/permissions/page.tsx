/**
 * MCP agent permissions page — Wave 10 §S10.1.
 *
 * Per-agent scopes, last token rotation, and rotate / revoke actions.
 * Expanding a row shows an inline PermissionEditor form.
 */

'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { FormattedMessage } from '@domio/ui';
import enMessages from '../../../../messages/en.json';
import { Badge, type BadgeTone } from '../../../components/Badge';
import { PermissionEditor, MCP_SCOPES } from '../../../components/mcp/PermissionEditor';
import {
  listMCPAgents,
  revokeAgent,
  rotateAgentToken,
  type MCPAgentPermission,
} from '../../../lib/mcp-service';

const CATALOGUE = enMessages as Readonly<Record<string, string>>;

function toneForAgentStatus(status: MCPAgentPermission['status']): BadgeTone {
  return status === 'active' ? 'green' : 'grey';
}

function formatRelTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 0) return 'just now';
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function scopeLabel(value: string): string {
  const def = MCP_SCOPES.find((s) => s.value === value);
  return def ? def.label : value;
}

function scopeTone(value: string): BadgeTone {
  switch (value) {
    case 'this-deck-only':
      return 'brand';
    case 'read-only':
      return 'green';
    case 'data-binding-only':
      return 'amber';
    case 'no-brand-locked-regions':
      return 'red';
    default:
      return 'grey';
  }
}

export default function MCPPermissionsPage() {
  const [agents, setAgents] = useState<MCPAgentPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listMCPAgents();
      setAgents(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleRotate(agentId: string) {
    setBusyId(agentId);
    try {
      await rotateAgentToken(agentId);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to rotate token');
    } finally {
      setBusyId(null);
    }
  }

  async function handleRevoke(agentId: string) {
    setBusyId(agentId);
    try {
      await revokeAgent(agentId);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revoke agent');
    } finally {
      setBusyId(null);
    }
  }

  async function handleSaveScopes(next: MCPAgentPermission) {
    // In a real deployment this would POST the updated scopes. For now
    // we mutate local state so the UI reflects the new selection.
    setAgents((prev) => prev.map((a) => (a.agent_id === next.agent_id ? { ...next } : a)));
    setExpandedId(null);
  }

  return (
    <div className="space-y-4" data-testid="mcp-permissions-page">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          <FormattedMessage id="admin.mcp.permissions.heading" catalogue={CATALOGUE} />
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Per-agent scopes and token rotation. Revoked agents retain their history but cannot make
          new tool calls.
        </p>
      </header>

      {error && (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
          role="alert"
        >
          <strong className="font-semibold">Error.</strong> {error}
        </div>
      )}

      {loading && (
        <div className="space-y-2" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-200" />
          ))}
        </div>
      )}

      {!loading && agents.length === 0 && (
        <div
          className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500"
          data-testid="mcp-permissions-empty"
        >
          <FormattedMessage id="admin.mcp.permissions.empty" catalogue={CATALOGUE} />
        </div>
      )}

      {!loading && agents.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <FormattedMessage id="admin.mcp.permissions.col.agent" catalogue={CATALOGUE} />
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <FormattedMessage id="admin.mcp.permissions.col.scopes" catalogue={CATALOGUE} />
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <FormattedMessage
                      id="admin.mcp.permissions.col.tokenRotated"
                      catalogue={CATALOGUE}
                    />
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {agents.map((agent) => {
                  const expanded = expandedId === agent.agent_id;
                  const busy = busyId === agent.agent_id;
                  return (
                    <Fragment key={agent.agent_id}>
                      <tr
                        data-testid={`mcp-agent-row-${agent.agent_id}`}
                        className="hover:bg-slate-50"
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex flex-col">
                            <span className="font-medium text-slate-800">{agent.agent_name}</span>
                            <span className="font-mono text-[11px] text-slate-500">
                              {agent.agent_id}
                            </span>
                          </div>
                          <div className="mt-1">
                            <Badge tone={toneForAgentStatus(agent.status)}>{agent.status}</Badge>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {agent.scopes.length === 0 ? (
                              <span className="text-xs text-slate-400">(none)</span>
                            ) : (
                              agent.scopes.map((scope) => (
                                <Badge key={scope} tone={scopeTone(scope)}>
                                  {scopeLabel(scope)}
                                </Badge>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">
                          {formatRelTime(agent.token_last_rotated_ms)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setExpandedId(expanded ? null : agent.agent_id)}
                              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                            >
                              {expanded ? 'Hide editor' : 'Edit scopes'}
                            </button>
                            <button
                              type="button"
                              data-testid={`mcp-agent-rotate-${agent.agent_id}`}
                              disabled={busy || agent.status === 'revoked'}
                              onClick={() => handleRotate(agent.agent_id)}
                              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <FormattedMessage
                                id="admin.mcp.permissions.rotate"
                                catalogue={CATALOGUE}
                              />
                            </button>
                            <button
                              type="button"
                              data-testid={`mcp-agent-revoke-${agent.agent_id}`}
                              disabled={busy || agent.status === 'revoked'}
                              onClick={() => handleRevoke(agent.agent_id)}
                              className="rounded-md border border-rose-300 bg-white px-2.5 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <FormattedMessage
                                id="admin.mcp.permissions.revoke"
                                catalogue={CATALOGUE}
                              />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <tr data-testid={`mcp-agent-editor-row-${agent.agent_id}`}>
                          <td colSpan={4} className="bg-slate-50 px-4 py-3">
                            <PermissionEditor
                              agent={agent}
                              onSave={handleSaveScopes}
                              onCancel={() => setExpandedId(null)}
                              busy={busy}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
