'use client';

import { useEffect, useRef, useState } from 'react';
import { intensityToCss } from '../../components/ViridisScale';

export interface HeatmapCanvasProps {
  deckId: string;
  slideId: string;
  cells: ReadonlyArray<{ x: number; y: number; intensity: number }>;
  cols: number;
  rows: number;
  cellSize?: number;
  onCellClick?: (cell: { x: number; y: number; intensity: number }) => void;
}

/**
 * Renders a 32×18 grid of dwell-intensity tiles on Canvas2D with a
 * viridis color scale. Hover displays the (x, y) and intensity;
 * click invokes `onCellClick`.
 *
 * The renderer uses a backing <canvas> and (re)paints on every
 * dimension or intensity change. The hover overlay is a single
 * absolutely-positioned <div> with cheap-to-update text — no DOM
 * thrash.
 */
export function HeatmapCanvas({
  cells,
  cols,
  rows,
  cellSize = 18,
  onCellClick,
}: HeatmapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; intensity: number } | null>(null);

  const width = cols * cellSize;
  const height = rows * cellSize;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    // Build an intensity lookup.
    const lookup = new Map<number, number>();
    for (const c of cells) {
      lookup.set(c.y * cols + c.x, c.intensity);
    }

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const intensity = lookup.get(y * cols + x) ?? 0;
        ctx.fillStyle = intensityToCss(Math.min(1, Math.max(0, intensity)));
        ctx.fillRect(x * cellSize, y * cellSize, cellSize - 1, cellSize - 1);
      }
    }
  }, [cells, cols, rows, cellSize, width, height]);

  function handleMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const x = Math.floor(px / cellSize);
    const y = Math.floor(py / cellSize);
    if (x < 0 || x >= cols || y < 0 || y >= rows) {
      setHover(null);
      return;
    }
    const cell = cells.find((c) => c.x === x && c.y === y);
    setHover({ x, y, intensity: cell?.intensity ?? 0 });
  }

  function handleClick() {
    if (hover && onCellClick) onCellClick(hover);
  }

  return (
    <div className="relative inline-block">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
        onClick={handleClick}
        className="rounded-md border border-slate-800"
        style={{ cursor: onCellClick ? 'pointer' : 'crosshair' }}
      />
      {hover ? (
        <div className="pointer-events-none absolute left-2 top-2 rounded bg-slate-900/90 px-2 py-1 text-xs font-mono text-white shadow">
          ({hover.x}, {hover.y}) · {hover.intensity.toFixed(3)}
        </div>
      ) : null}
    </div>
  );
}
