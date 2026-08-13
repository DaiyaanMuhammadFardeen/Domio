'use client';

import { useState } from 'react';
import { clsx } from 'clsx';
import type {
  ElementHeatmap as ElementHeatmapShape,
  SlideElement,
} from '../lib/element-heatmap-service';
import { ElementTimeSeries } from './ElementTimeSeries';

export interface ElementHeatmapProps {
  workspaceId: string;
  data: ElementHeatmapShape;
  onElementClick?: (el: SlideElement) => void;
}

/**
 * Slide preview with per-element attention overlay. Each element is
 * drawn as a translucent rectangle whose opacity is proportional to
 * `attention`. Clicking an element drills into a time-series chart
 * below the preview.
 *
 * Tailwind colors are picked from the brand/slate scale; raw hex is
 * forbidden by `domio/no-raw-hex`. The container is a 16:9 frame
 * (width 100%, height auto via `aspect-video`).
 */
export function ElementHeatmap({ workspaceId, data, onElementClick }: ElementHeatmapProps) {
  const [selected, setSelected] = useState<SlideElement | null>(null);

  const handleClick = (el: SlideElement) => {
    setSelected(el);
    onElementClick?.(el);
  };

  return (
    <div className="space-y-4">
      <div
        className="relative aspect-video w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
        data-testid="slide-preview"
      >
        {/* Faux slide chrome — three placeholder content blocks so the
            overlay rectangles have visible neighbours. */}
        <div className="absolute inset-x-6 top-4 h-3 rounded bg-slate-200" aria-hidden />
        <div className="absolute inset-x-6 bottom-4 h-2 rounded bg-slate-200" aria-hidden />
        {data.elements.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            No element attention data — connect the warehouse.
          </div>
        ) : (
          data.elements.map((el) => {
            const isSelected = selected?.id === el.id;
            const opacity = Math.max(0.15, Math.min(0.9, el.attention));
            return (
              <button
                key={el.id}
                type="button"
                onClick={() => handleClick(el)}
                aria-label={`${el.label} (${el.kind}) attention ${(el.attention * 100).toFixed(0)}%`}
                data-testid="slide-element"
                data-element-id={el.id}
                data-element-kind={el.kind}
                className={clsx(
                  'absolute flex items-center justify-center rounded border text-[10px] font-semibold uppercase tracking-wide transition',
                  el.kind === 'chart' && 'bg-brand-500/30 border-brand-700 text-brand-800',
                  el.kind === 'button' && 'bg-emerald-500/30 border-emerald-700 text-emerald-800',
                  el.kind === 'text' && 'bg-slate-500/30 border-slate-700 text-slate-800',
                  el.kind === 'image' && 'bg-amber-500/30 border-amber-700 text-amber-800',
                  el.kind === 'table' && 'bg-violet-500/30 border-violet-700 text-violet-800',
                  el.kind === 'video' && 'bg-rose-500/30 border-rose-700 text-rose-800',
                  isSelected && 'ring-2 ring-offset-1 ring-slate-900',
                )}
                style={{
                  left: `${el.x * 100}%`,
                  top: `${el.y * 100}%`,
                  width: `${el.width * 100}%`,
                  height: `${el.height * 100}%`,
                  opacity,
                }}
              >
                {el.label}
              </button>
            );
          })
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span className="rounded bg-brand-100 px-2 py-0.5 font-medium text-brand-800">chart</span>
        <span className="rounded bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800">
          button
        </span>
        <span className="rounded bg-slate-200 px-2 py-0.5 font-medium text-slate-800">text</span>
        <span className="rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-800">image</span>
        <span className="rounded bg-violet-100 px-2 py-0.5 font-medium text-violet-800">table</span>
        <span className="rounded bg-rose-100 px-2 py-0.5 font-medium text-rose-800">video</span>
        <span className="ml-auto">
          {data.elements.length} element{data.elements.length === 1 ? '' : 's'}
        </span>
      </div>

      {selected ? (
        <ElementTimeSeries
          workspaceId={workspaceId}
          elementId={selected.id}
          elementLabel={selected.label}
        />
      ) : (
        <div
          className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-500"
          data-testid="drill-in-empty"
        >
          Click an element to drill into its time series.
        </div>
      )}
    </div>
  );
}
