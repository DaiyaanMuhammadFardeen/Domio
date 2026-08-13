/**
 * /csat — server component.
 *
 * Pulls the CSAT / NPS breakdown from the warehouse via
 * `sentiment-service.fetchCsat`. When the warehouse is unreachable
 * the breakdown renders an empty state — never synthetic CSAT.
 */

import { CSATBreakdown } from '../../components/CSATBreakdown';
import { fetchCsat } from '../../lib/sentiment-service';

export default async function CsatPage({
  searchParams,
}: {
  searchParams: Promise<{ deckId?: string; slideId?: string }>;
}) {
  const params = await searchParams;
  const workspaceId = process.env['NEXT_PUBLIC_WORKSPACE_ID'] ?? 'ws-demo';
  const deckId = params.deckId ?? 'deck-1';
  const slideId = params.slideId;

  const data = await fetchCsat(workspaceId, {
    deckId,
    ...(slideId ? { slideId } : {}),
  });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">CSAT &amp; NPS</h1>
        <p className="text-sm text-slate-500">
          Per-session + per-slide scores · deck{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5">{deckId}</code>
          {slideId ? (
            <>
              {' '}
              · slide <code className="rounded bg-slate-100 px-1.5 py-0.5">{slideId}</code>
            </>
          ) : null}
        </p>
      </header>

      <form className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
            Deck
          </span>
          <input
            name="deckId"
            defaultValue={deckId}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
            Slide (optional)
          </span>
          <input
            name="slideId"
            defaultValue={slideId ?? ''}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          Apply
        </button>
      </form>

      <CSATBreakdown data={data} />
    </div>
  );
}
