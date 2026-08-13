/**
 * /sentiment — server component.
 *
 * Pulls the per-slide sentiment timeline from the warehouse via
 * `sentiment-service.fetchSentiment`. When the warehouse is
 * unreachable the timeline renders an empty state — never
 * synthetic sentiment scores.
 */

import { SentimentTimeline } from '../../components/SentimentTimeline';
import { fetchSentiment } from '../../lib/sentiment-service';

export default async function SentimentPage({
  searchParams,
}: {
  searchParams: Promise<{ deckId?: string }>;
}) {
  const params = await searchParams;
  const workspaceId = process.env['NEXT_PUBLIC_WORKSPACE_ID'] ?? 'ws-demo';
  const deckId = params.deckId ?? 'deck-1';
  const series = await fetchSentiment(workspaceId, deckId);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Sentiment</h1>
        <p className="text-sm text-slate-500">
          Daily sentiment per slide · deck{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5">{deckId}</code>
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
        <button
          type="submit"
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          Apply
        </button>
      </form>

      <SentimentTimeline series={series} />
    </div>
  );
}