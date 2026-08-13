/**
 * Agent-to-agent handoff inspector — Wave 10 §S10.8.
 *
 * Top: a sortable list of recent pipelines.
 * Below: the selected pipeline's detail panel — graph visualizer,
 * per-node detail, and a "Replay" button.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FormattedMessage } from '@domio/ui';
import { Play, RotateCw } from 'lucide-react';
import enMessages from '../../../messages/en.json';
import { PipelineGraph, AgentNodeDetail, PipelineTable } from '../../components/agent-handoff';
import {
  listPipelines,
  getPipeline,
  replayPipeline,
  type AgentNode,
  type Pipeline,
} from '../../lib/agent-handoff-service';

const CATALOGUE = enMessages as Readonly<Record<string, string>>;

export default function AgentHandoffPage() {
  const [pipelines, setPipelines] = useState<ReadonlyArray<Pipeline>>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Pipeline | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [replayNotice, setReplayNotice] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listPipelines();
      setPipelines(list);
      // Auto-select the most recent pipeline so the graph + detail panel
      // has something to render on first paint.
      setSelectedRunId((prev) => prev ?? list[0]?.run_id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pipelines');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // Fetch detail when a row is selected.
  useEffect(() => {
    let cancelled = false;
    if (!selectedRunId) {
      setDetail(null);
      return;
    }
    setDetail(null);
    setSelectedNodeId(null);
    getPipeline(selectedRunId).then((p) => {
      if (!cancelled) setDetail(p);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedRunId]);

  const selectedNode: AgentNode | null = useMemo(() => {
    if (!detail) return null;
    if (selectedNodeId) {
      return detail.nodes.find((n) => n.id === selectedNodeId) ?? null;
    }
    return detail.nodes[0] ?? null;
  }, [detail, selectedNodeId]);

  const handleReplay = useCallback(async () => {
    if (!selectedRunId || replaying) return;
    setReplaying(true);
    setReplayNotice(null);
    try {
      const { new_run_id } = await replayPipeline(selectedRunId);
      setReplayNotice(new_run_id);
      const list = await listPipelines();
      setPipelines(list);
      setSelectedRunId(new_run_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Replay failed');
    } finally {
      setReplaying(false);
    }
  }, [selectedRunId, replaying]);

  return (
    <div data-testid="agent-handoff-page" className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          <FormattedMessage id="admin.agentHandoff.heading" catalogue={CATALOGUE} />
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          <FormattedMessage id="admin.agentHandoff.subheading" catalogue={CATALOGUE} />
        </p>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
        >
          <strong className="font-semibold">Error.</strong> {error}
        </div>
      )}

      {replayNotice && (
        <div
          data-testid="agent-handoff-replay-toast"
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          <FormattedMessage id="admin.agentHandoff.replaySuccess" catalogue={CATALOGUE} />{' '}
          <span className="font-mono text-xs">{replayNotice}</span>
        </div>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
            Pipelines
          </h2>
          <button
            type="button"
            data-testid="agent-handoff-refresh"
            onClick={loadList}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
            title="Refresh"
          >
            <RotateCw className="h-3 w-3" aria-hidden />
            Refresh
          </button>
        </div>
        {loading && pipelines.length === 0 ? (
          <div className="space-y-2" aria-busy>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-200" />
            ))}
          </div>
        ) : (
          <PipelineTable
            pipelines={pipelines}
            selectedRunId={selectedRunId}
            onSelect={setSelectedRunId}
            emptyMessage={CATALOGUE['admin.agentHandoff.empty'] ?? 'No pipelines yet.'}
          />
        )}
      </section>

      <section
        data-testid="agent-handoff-detail"
        className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/40 p-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
            {detail ? (
              <span>
                Pipeline{' '}
                <span className="font-mono text-xs text-slate-700">{detail.run_id}</span>
              </span>
            ) : (
              'Pipeline detail'
            )}
          </h2>
          <button
            type="button"
            data-testid="agent-handoff-replay"
            disabled={!detail || replaying}
            onClick={handleReplay}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play className="h-3 w-3" aria-hidden />
            {replaying
              ? CATALOGUE['admin.agentHandoff.replaying'] ?? 'Replaying…'
              : CATALOGUE['admin.agentHandoff.replay'] ?? 'Replay'}
          </button>
        </div>

        {!detail ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            Select a pipeline from the table above to inspect its graph.
          </div>
        ) : (
          <>
            <PipelineGraph
              nodes={detail.nodes}
              edges={detail.edges}
              selectedNodeId={selectedNode?.id ?? null}
              onSelectNode={setSelectedNodeId}
            />
            <AgentNodeDetail node={selectedNode} />
          </>
        )}
      </section>
    </div>
  );
}