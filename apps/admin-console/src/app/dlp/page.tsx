/**
 * DLP rules admin page — Wave 8 §S8.3.
 *
 * Three-pane layout:
 *   1. KPI strip across the top (total / active / hits-24h).
 *   2. Left column: rule list with a "+ New rule" toggle that opens
 *      the builder inline; selected rows drive the test pane.
 *   3. Right column: live test pane that runs the selected rule
 *      against sample text and highlights matches.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { KpiTile } from '../../components/KpiTile';
import { RuleBuilder } from '../../components/dlp/RuleBuilder';
import { RuleList } from '../../components/dlp/RuleList';
import { TestRule } from '../../components/dlp/TestRule';
import {
  createDLPRule,
  deleteDLPRule,
  listDLPRules,
  toggleDLPRule,
  updateDLPRule,
} from '../../lib/dlp-service';
import type { DLPRule, DLPRuleInput, DLPTestResult } from '../../lib/types';

export default function DLPPage() {
  const [rules, setRules] = useState<ReadonlyArray<DLPRule>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<DLPTestResult | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listDLPRules();
      setRules(list.items);
      if (!selectedId && list.items[0]) {
        setSelectedId(list.items[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load DLP rules');
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const total = rules.length;
  const active = rules.filter((r) => r.enabled).length;
  const hits24h = rules.reduce((acc, r) => acc + r.hits_24h, 0);

  const editingRule = editingId ? (rules.find((r) => r.id === editingId) ?? null) : null;
  const selectedRule = selectedId ? (rules.find((r) => r.id === selectedId) ?? null) : null;

  async function handleSave(input: DLPRuleInput) {
    if (editingId) {
      await updateDLPRule(editingId, input);
    } else {
      await createDLPRule(input);
    }
    setCreating(false);
    setEditingId(null);
    await loadData();
  }

  async function handleToggle(id: string, enabled: boolean) {
    try {
      await toggleDLPRule(id, enabled);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to toggle rule');
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this DLP rule?')) return;
    try {
      await deleteDLPRule(id);
      if (selectedId === id) setSelectedId(null);
      if (editingId === id) setEditingId(null);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete rule');
    }
  }

  function handleEdit(id: string) {
    setCreating(false);
    setEditingId(id);
  }

  function handleNew() {
    setEditingId(null);
    setCreating((v) => !v);
  }

  return (
    <div data-testid="dlp-page" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Data Loss Prevention
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Patterns to detect sensitive content across decks, comments, and assets.
          </p>
        </div>
        <button
          type="button"
          onClick={handleNew}
          data-testid="dlp-new-rule"
          className="inline-flex items-center gap-1.5 self-start rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700"
        >
          {creating ? (
            <X className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Plus className="h-3.5 w-3.5" aria-hidden />
          )}
          {creating ? 'Cancel' : 'New rule'}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiTile title="Total Rules" value={String(total)} tone="brand" />
        <KpiTile title="Active" value={String(active)} tone={active > 0 ? 'success' : 'muted'} />
        <KpiTile
          title="Hits (24h)"
          value={String(hits24h)}
          tone={hits24h > 0 ? 'warning' : 'muted'}
        />
      </div>

      {error && (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
          role="alert"
        >
          <strong className="font-semibold">Error.</strong> {error}
        </div>
      )}

      {(creating || editingRule) && (
        <RuleBuilder
          initial={editingRule ?? undefined}
          onSave={handleSave}
          onCancel={() => {
            setCreating(false);
            setEditingId(null);
          }}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Rules</h2>
          {loading ? (
            <div className="space-y-2" aria-busy>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-200" />
              ))}
            </div>
          ) : (
            <RuleList
              rules={rules}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onEdit={handleEdit}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          )}
        </div>
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Tester</h2>
          <TestRule rule={selectedRule} onTest={setTestResult} />
          {testResult && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              Last result:{' '}
              <strong className="font-semibold">
                {testResult.matched ? 'matched' : 'no match'}
              </strong>{' '}
              ({testResult.matches.length} occurrence{testResult.matches.length === 1 ? '' : 's'},{' '}
              {testResult.latency_ms.toFixed(2)}ms).
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
