/**
 * /heatmap — server component with deck + slide selectors.
 *
 * Pulls the heatmap tile from the warehouse (which delegates to the
 * heatmap-generator service). Falls back to a 32×18 deterministic
 * synthetic grid if no data is available so the page renders offline.
 */

import { HeatmapCanvas } from './HeatmapCanvas';

const WAREHOUSE_URL = process.env['WAREHOUSE_URL'] ?? 'http://localhost:8088';
const COLS = 32;
const ROWS = 18;

interface HeatmapCell {
  x: number;
  y: number;
  intensity: number;
}

async function fetchHeatmap(
  workspaceId: string,
  deckId: string,
  slideId: string,
): Promise<HeatmapCell[]> {
  const url = new URL(
    `/v1/decks/${encodeURIComponent(deckId)}/slides/${encodeURIComponent(slideId)}/heatmap`,
    WAREHOUSE_URL,
  );
  url.searchParams.set('workspace_id', workspaceId);
  url.searchParams.set('from_ms', String(Date.now() - 7 * 24 * 60 * 60 * 1000));
  url.searchParams.set('to_ms', String(Date.now()));
  try {
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) return [];
    const json = (await res.json()) as { tile: { cells: HeatmapCell[] } };
    return json.tile?.cells ?? [];
  } catch {
    return [];
  }
}

function synthCells(): HeatmapCell[] {
  const cells: HeatmapCell[] = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      // A pleasant radial fall-off centered on the slide.
      const dx = x - COLS / 2;
      const dy = y - ROWS / 2;
      const d = Math.sqrt(dx * dx + dy * dy);
      const intensity = Math.max(0, 1 - d / (COLS / 2));
      cells.push({ x, y, intensity });
    }
  }
  return cells;
}

export default async function HeatmapPage({
  searchParams,
}: {
  searchParams: Promise<{ deckId?: string; slideId?: string }>;
}) {
  const params = await searchParams;
  const workspaceId = process.env['NEXT_PUBLIC_WORKSPACE_ID'] ?? 'ws-demo';
  const deckId = params.deckId ?? 'deck-1';
  const slideId = params.slideId ?? 'slide-1';

  const fetched = await fetchHeatmap(workspaceId, deckId, slideId);
  const cells = fetched.length > 0 ? fetched : synthCells();

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

      <HeatmapCanvas
        deckId={deckId}
        slideId={slideId}
        cells={cells}
        cols={COLS}
        rows={ROWS}
      />
    </div>
  );
}