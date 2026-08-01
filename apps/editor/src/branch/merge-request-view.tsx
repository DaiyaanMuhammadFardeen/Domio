'use client';

import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { BranchClient, DiffConflict, MergeRequestSummary } from './types.js';
import { ConflictResolver } from './conflict-resolver.js';

export interface MergeRequestViewProps {
  deckId: string;
  client: BranchClient;
  request: MergeRequestSummary;
  onUpdated?: (request: MergeRequestSummary) => void;
  onMerged?: (newRevision: number) => void;
}

export function MergeRequestView({ deckId, client, request, onUpdated, onMerged }: MergeRequestViewProps): ReactElement {
  const [current, setCurrent] = useState(request);
  const [strategy, setStrategy] = useState<'theirs' | 'ours' | 'manual'>('manual');
  const [resolutions, setResolutions] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setCurrent(request), [request]);

  async function resolve(): Promise<void> {
    setBusy(true); setError(null);
    try {
      const updated = await client.resolveMergeRequest(deckId, current.id, strategy, resolutions);
      setCurrent(updated); onUpdated?.(updated);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to resolve merge request.'); }
    finally { setBusy(false); }
  }

  async function merge(): Promise<void> {
    setBusy(true); setError(null);
    try {
      const result = await client.commitMergeRequest(deckId, current.id, resolutions);
      setCurrent(result.mergeRequest); onUpdated?.(result.mergeRequest); onMerged?.(result.newRevision);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to merge.'); }
    finally { setBusy(false); }
  }

  const conflicts = current.diffSummary.conflicts;
  return (
    <section aria-label={`Merge request ${current.id}`} className="merge-request-view">
      <header><h2>Merge {current.sourceBranchId} → {current.targetBranchId}</h2><strong>{current.status}</strong></header>
      <p>{current.diffSummary.slides.added.length} added · {current.diffSummary.slides.modified.length} modified · {current.diffSummary.slides.removed.length} removed · {conflicts.length} conflicts</p>
      <div className="merge-request-view__panes">
        <article><h3>Target</h3><p>Revision {current.targetRevision}</p></article>
        <article><h3>Source</h3><p>Revision {current.sourceRevision}</p></article>
        <article><h3>Resolved</h3><p>{current.resolutionStrategy ?? 'Not resolved'}</p></article>
      </div>
      {conflicts.length > 0 && <ConflictResolver conflicts={conflicts} values={resolutions} onChange={setResolutions} />}
      {error && <p role="alert">{error}</p>}
      <label>Resolution strategy <select value={strategy} onChange={(e) => setStrategy(e.target.value as typeof strategy)}><option value="theirs">Theirs</option><option value="ours">Ours</option><option value="manual">Manual</option></select></label>
      <button type="button" onClick={() => void resolve()} disabled={busy || current.status === 'merged'}>Resolve</button>
      <button type="button" onClick={() => void merge()} disabled={busy || (current.status !== 'resolved' && conflicts.length > 0)}>Merge</button>
    </section>
  );
}

export function conflictKey(conflict: DiffConflict): string { return `${conflict.slideId}:${conflict.elementId}:${conflict.path}`; }
