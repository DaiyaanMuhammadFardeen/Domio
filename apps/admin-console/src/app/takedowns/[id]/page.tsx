/**
 * Takedown detail page — Wave 9 §S9.6.
 *
 * Full-page view for a single takedown request. Renders the shared
 * `<TakedownDetailPanel>` so its layout stays in sync with the inline
 * drawer on the listing page.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { adminConsole } from '@domio/ui';
import { TakedownDetailPanel } from '../../../components/takedowns/TakedownDetailPanel';
import { getTakedown, listTakedownEvents, type TakedownEvent } from '../../../lib/takedown-service';
import { fetcher } from '../../../lib/fetcher';
import type { TakedownRequest } from '../../../lib/types';
import type { ResolveDecision } from '../../../components/takedowns/ResolveForm';

const LABELS = {
  claimant: 'Claimant',
  respondent: 'Respondent',
  evidence: 'Evidence',
  statement: 'Statement',
  notes: 'Resolution notes',
  events: 'Timeline',
  confirm: 'Confirm takedown',
  dismiss: 'Dismiss',
  counterNotice:
    'A counter-notice has been submitted for this request. The original claimant has 10 business days to respond with legal action before the listing is restored.',
  notesPlaceholder: 'Add notes about this resolution…',
  submitted: 'Submitted',
  resolved: 'Resolved',
  backToQueue: 'Back to queue',
  notFound: 'Takedown request not found.',
  resolveError: 'Failed to resolve takedown',
};

export default function TakedownDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const [request, setRequest] = useState<TakedownRequest | null>(null);
  const [events, setEvents] = useState<ReadonlyArray<TakedownEvent>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const backHref = adminConsole('takedowns');

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [t, ev] = await Promise.all([getTakedown(id), listTakedownEvents(id)]);
      setRequest(t);
      setEvents(ev);
      if (!t) setError(LABELS.notFound);
    } catch (e) {
      setError(e instanceof Error ? e.message : LABELS.notFound);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleResolve = useCallback(
    async (decision: ResolveDecision, notes: string) => {
      if (!request) return;
      setBusy(true);
      setError(null);
      try {
        await fetcher(`/v1/takedowns/${encodeURIComponent(request.request_id)}/resolve`, {
          method: 'POST',
          body: { decision, resolution_notes: notes || undefined },
        });
        await loadData();
      } catch (e) {
        setError(e instanceof Error ? e.message : LABELS.resolveError);
      } finally {
        setBusy(false);
      }
    },
    [request, loadData],
  );

  return (
    <div className="space-y-6" data-testid="takedown-detail-page">
      <div>
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {LABELS.backToQueue}
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Takedown {id}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Filing party, respondent, evidence, statement, and resolution history.
        </p>
      </div>

      {loading && (
        <div className="space-y-2" aria-busy>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-slate-200" />
          ))}
        </div>
      )}

      {error && (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
          role="alert"
        >
          <strong className="font-semibold">Error.</strong> {error}
        </div>
      )}

      {!loading && !error && request && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <header className="mb-4 border-b border-slate-200 pb-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Request ID
            </div>
            <div className="mt-0.5 font-mono text-sm text-slate-900">
              {request.request_id}
            </div>
            <div className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
              Listing
            </div>
            <div className="mt-0.5 font-mono text-sm text-slate-900">
              {request.listing_id}
            </div>
          </header>
          <TakedownDetailPanel
            request={request}
            events={events}
            labels={LABELS}
            onResolve={busy ? undefined : handleResolve}
          />
        </section>
      )}
    </div>
  );
}