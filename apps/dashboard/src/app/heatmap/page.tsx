/**
 * /heatmap — server component with deck + slide selectors.
 *
 * Per Wave 7 §S7.1 of docs/frontend-roadmap/07-wave-analytics-insights.md:
 *   - Wired to `GET /v1/analytics/heatmap`.
 *   - No synthetic 32×18 intensity grid.
 *   - SuspenseBoundary + `<EmptyState>` from @domio/ui.
 *
 * Pulls the heatmap tile from the warehouse via
 * `heatmap-service.fetchHeatmap`. When the warehouse is unreachable
 * the canvas renders an empty grid — never a synthetic intensity.
 */

import { SuspenseBoundary, EmptyState } from '@domio/ui';
import { HeatmapCanvas } from './HeatmapCanvas';
import { fetchHeatmap } from '../../lib/heatmap-service';

const COLS = 32;
const ROWS = 18;

export default async function HeatmapPage({
  searchParams,
}: {
  searchParams: Promise<{ deckId?: string; slideId?: string }>;
}) {
  const params = await searchParams;
  const workspaceId = process.env['NEXT_PUBLIC_WORKSPACE_ID'] ?? 'ws-demo';
  const deckId = params.deckId ?? 'deck-1';
  const slideId = params.slideId ?? 'slide-1';

  const cells = await fetchHeatmap(workspaceId, deckId, slideId);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Heatmap</h1>
        <p className="text-sm text-slate-500">
          {COLS}×{ROWS} grid · deck <code className="rounded bg-slate-100 px-1.5 py-0.5">{deckId}</code> · slide <code className="rounded bg-slate-100 px-1.5 py-0.5">{slideId}</code>
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

      <SuspenseBoundary>
        {cells.length === 0 ? (
          <EmptyState
            title="No heatmap data"
            description="The warehouse has no viewer-attention telemetry for this deck/slide. The canvas renders once the event-ingest pipeline records traffic."
          />
        ) : (
          <HeatmapCanvas
            deckId={deckId}
            slideId={slideId}
            cells={cells}
            cols={COLS}
            rows={ROWS}
          />
        )}
      </SuspenseBoundary>
    </div>
  );
}