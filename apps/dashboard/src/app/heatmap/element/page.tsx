/**
 * /heatmap/element — server component.
 *
 * Pulls the per-element attention overlay from the warehouse via
 * `element-heatmap-service.fetchElementHeatmap`. When the warehouse
 * is unreachable the preview renders an empty overlay — never
 * synthetic attention weights.
 */

import { ElementHeatmap } from '../../../components/ElementHeatmap';
import { fetchElementHeatmap } from '../../../lib/element-heatmap-service';

export default async function ElementHeatmapPage({
  searchParams,
}: {
  searchParams: Promise<{ deckId?: string; slideId?: string }>;
}) {
  const params = await searchParams;
  const workspaceId = process.env['NEXT_PUBLIC_WORKSPACE_ID'] ?? 'ws-demo';
  const deckId = params.deckId ?? 'deck-1';
  const slideId = params.slideId ?? 'slide-1';
  const data = await fetchElementHeatmap(workspaceId, deckId, slideId);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Element heatmap</h1>
        <p className="text-sm text-slate-500">
          Per-element attention on{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5">{deckId}</code> · slide{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5">{slideId}</code>
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
            Slide
          </span>
          <input
            name="slideId"
            defaultValue={slideId}
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

      <ElementHeatmap workspaceId={workspaceId} data={data} />
    </div>
  );
}
