'use client';

/**
 * HeatmapPanel — Phase 10 M5.2.
 *
 * Renders the click + dwell + slide-drop heatmap aggregated by
 * @domio/prototype-recorder's HeatmapAggregator. The panel paints a
 * coarse grid of cells so editors can spot hotspots at a glance.
 *
 * data-testid prefix: `m5-heatmap-`.
 */

import { useMemo } from 'react';
import type { ReactElement } from 'react';

export interface HeatCellView {
  readonly x: number;
  readonly y: number;
  readonly clicks: number;
  readonly dwellMs: number;
  readonly slideDrops: number;
}

export interface HeatmapBucketView {
  readonly width: number;
  readonly height: number;
  readonly cells: readonly HeatCellView[];
}

interface HeatmapPanelProps {
  readonly bucket: HeatmapBucketView | null;
  readonly onReset: () => void;
  readonly onRegenerate: () => void;
  readonly onDownloadCSV: () => void;
}

export function HeatmapPanel({
  bucket,
  onReset,
  onRegenerate,
  onDownloadCSV,
}: HeatmapPanelProps): ReactElement {
  const maxClicks = useMemo(
    () => (bucket ? bucket.cells.reduce((m, c) => Math.max(m, c.clicks), 0) : 0),
    [bucket],
  );

  const totalDrops = useMemo(
    () => (bucket ? bucket.cells.reduce((s, c) => s + c.slideDrops, 0) : 0),
    [bucket],
  );

  return (
    <section className="heatmap-panel" data-testid="m5-heatmap-panel">
      <header className="heatmap-panel__header">
        <h2>Click heatmap</h2>
        <p className="heatmap-panel__help">
          Aggregated clicks, dwell, and slide drops across the active deck.
        </p>
      </header>

      <div className="heatmap-panel__controls" data-testid="m5-heatmap-controls">
        <button type="button" data-testid="m5-heatmap-regenerate" onClick={onRegenerate}>
          Regenerate
        </button>
        <button type="button" data-testid="m5-heatmap-reset" onClick={onReset}>
          Reset
        </button>
        <button type="button" data-testid="m5-heatmap-csv" onClick={onDownloadCSV}>
          Download CSV
        </button>
      </div>

      <div className="heatmap-panel__summary" data-testid="m5-heatmap-summary">
        <span data-testid="m5-heatmap-cell-count">{bucket?.cells.length ?? 0} cells</span>
        <span data-testid="m5-heatmap-max-clicks">max clicks: {maxClicks}</span>
        <span data-testid="m5-heatmap-slide-drops">slide drops: {totalDrops}</span>
      </div>

      <div
        className="heatmap-panel__grid"
        data-testid="m5-heatmap-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${bucket?.width ?? 16}, 1fr)`,
          gridTemplateRows: `repeat(${bucket?.height ?? 16}, 1fr)`,
          aspectRatio: '1 / 1',
        }}
      >
        {(bucket?.cells ?? []).map((cell, i) => {
          const intensity = maxClicks > 0 ? cell.clicks / maxClicks : 0;
          return (
            <div
              key={i}
              data-testid="m5-heatmap-cell"
              data-x={cell.x}
              data-y={cell.y}
              className="heatmap-panel__cell"
              style={{
                background: `rgba(255, 0, 64, ${intensity})`,
              }}
              title={`clicks=${cell.clicks} dwell=${cell.dwellMs}ms drops=${cell.slideDrops}`}
            />
          );
        })}
      </div>
    </section>
  );
}
