/**
 * TakedownDetailPanel — Wave 9 §S9.6.
 *
 * Shared panel rendering the body of a takedown request. Used by:
 *   - the inline drawer in /takedowns
 *   - the full-page detail at /takedowns/[id]
 *
 * The host decides chrome (drawer vs page surface) and supplies the
 * optional callbacks for resolving the request.
 */

'use client';

import { useCallback, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Badge, toneForTakedownStatus, toneForTakedownKind } from '../Badge';
import type { TakedownRequest, TakedownStatus } from '../../lib/types';
import type { TakedownEvent } from '../../lib/takedown-service';
import { ResolveForm, type ResolveDecision } from './ResolveForm';
import { TakedownTimeline } from './TakedownTimeline';

export interface TakedownDetailPanelLabels {
  readonly claimant: string;
  readonly respondent: string;
  readonly evidence: string;
  readonly statement: string;
  readonly notes: string;
  readonly events: string;
  readonly confirm: string;
  readonly dismiss: string;
  readonly counterNotice: string;
  readonly notesPlaceholder: string;
  readonly submitted: string;
  readonly resolved: string;
}

export interface TakedownDetailPanelProps {
  readonly request: TakedownRequest;
  readonly events: ReadonlyArray<TakedownEvent>;
  /** When provided, shows the resolve form for `received` / `in_review` requests. */
  readonly onResolve?:
    | ((decision: ResolveDecision, notes: string) => Promise<void> | void)
    | undefined;
  readonly labels: TakedownDetailPanelLabels;
}

export function TakedownDetailPanel({
  request,
  events,
  onResolve,
  labels,
}: TakedownDetailPanelProps) {
  const [busy, setBusy] = useState(false);

  const handleSubmit = useCallback(
    async (decision: ResolveDecision, notes: string) => {
      if (!onResolve) return;
      setBusy(true);
      try {
        await onResolve(decision, notes);
      } finally {
        setBusy(false);
      }
    },
    [onResolve],
  );

  const showResolveForm =
    onResolve !== undefined && (request.status === 'received' || request.status === 'in_review');

  return (
    <div className="space-y-5" data-testid="takedown-detail-panel">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Kind</div>
          <div className="mt-1">
            <Badge tone={toneForTakedownKind(request.kind)}>{request.kind}</Badge>
          </div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</div>
          <div className="mt-1">
            <Badge tone={toneForTakedownStatus(request.status as TakedownStatus)}>
              {request.status}
            </Badge>
          </div>
        </div>
      </div>

      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {labels.claimant}
        </div>
        <div className="mt-0.5 font-mono text-sm text-slate-900">{request.claimant_id}</div>
      </div>

      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {labels.respondent}
        </div>
        <div className="mt-0.5 font-mono text-sm text-slate-900">{request.listing_id}</div>
      </div>

      {request.evidence_url && (
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {labels.evidence}
          </div>
          <a
            href={request.evidence_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800"
          >
            {request.evidence_url} <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </div>
      )}

      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {labels.statement}
        </div>
        <p className="mt-0.5 text-sm leading-relaxed text-slate-700">{request.statement}</p>
      </div>

      {request.resolution_notes && (
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {labels.notes}
          </div>
          <p className="mt-0.5 text-sm text-slate-700">{request.resolution_notes}</p>
        </div>
      )}

      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {labels.events}
        </div>
        <div className="mt-2">
          <TakedownTimeline events={events} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-xs text-slate-500">
        <div>
          <span className="font-medium">{labels.submitted}:</span>{' '}
          {formatDate(request.submitted_at)}
        </div>
        <div>
          <span className="font-medium">{labels.resolved}:</span> {formatDate(request.resolved_at)}
        </div>
      </div>

      {showResolveForm && (
        <div className="border-t border-slate-200 pt-4">
          <ResolveForm
            busy={busy}
            onSubmit={handleSubmit}
            confirmLabel={labels.confirm}
            dismissLabel={labels.dismiss}
            notesLabel={labels.notes}
            notesPlaceholder={labels.notesPlaceholder}
          />
        </div>
      )}

      {request.status === 'counter_notice' && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
          {labels.counterNotice}
        </div>
      )}
    </div>
  );
}

function formatDate(ms: number | null): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default TakedownDetailPanel;
