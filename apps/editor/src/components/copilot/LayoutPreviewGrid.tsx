'use client';

/**
 * LayoutPreviewGrid — renders a layout descriptor as a slide preview.
 *
 * Per Wave 6 §S6.3 of docs/frontend-roadmap/06-wave-ai-copilot-ui.md:
 *   "Renders 4 `LayoutPreviewGrid` cards. Each preview is a layout
 *    descriptor rendered as a slide using the current theme."
 *
 * Pure presentation — the actual insertion happens in the parent
 * (`DesignerPanel`) when the user clicks Apply.
 */

import type { ReactElement } from 'react';
import type { LayoutDescriptor } from '../../lib/designer-service';
import { cn } from '../../lib/cn';

export interface LayoutPreviewGridProps {
  readonly layout: LayoutDescriptor;
  readonly onApply?: (id: string) => void;
  readonly selected?: boolean;
}

function accentClasses(slot: LayoutDescriptor['accentSlot']): string {
  switch (slot) {
    case 'left':
      return 'border-l-4 border-l-blue-500';
    case 'right':
      return 'border-r-4 border-r-blue-500';
    case 'bottom':
      return 'border-b-4 border-b-blue-500';
    case 'top':
    default:
      return 'border-t-4 border-t-blue-500';
  }
}

function layoutBody(layout: LayoutDescriptor): ReactElement {
  switch (layout.kind) {
    case 'title-hero':
      return (
        <div className="flex h-full flex-col items-center justify-center gap-1.5 p-3 text-center">
          <div className="h-2 w-3/4 rounded-full bg-slate-300" />
          <div className="h-1.5 w-1/2 rounded-full bg-slate-200" />
          <div className="h-1 w-2/5 rounded-full bg-slate-100" />
        </div>
      );
    case 'data-focus':
      return (
        <div className="grid h-full grid-cols-2 gap-1 p-2">
          <div className="rounded bg-amber-200/60 p-1">
            <div className="h-1.5 w-2/3 rounded-full bg-amber-500/60" />
            <div className="mt-1 h-1 w-1/2 rounded-full bg-amber-500/40" />
          </div>
          <div className="rounded bg-blue-200/60 p-1">
            <div className="h-1.5 w-2/3 rounded-full bg-blue-500/60" />
            <div className="mt-1 h-1 w-1/2 rounded-full bg-blue-500/40" />
          </div>
          <div className="col-span-2 rounded bg-slate-100 p-1">
            <div className="flex h-6 items-end gap-0.5">
              {[3, 5, 4, 7, 6, 8, 5].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t bg-blue-500/70"
                  style={{ height: `${h * 8}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      );
    case 'chart-with-caption':
      return (
        <div className="flex h-full flex-col gap-1.5 p-2">
          <div className="flex-1 rounded bg-slate-100 p-1">
            <div className="flex h-full items-end gap-0.5">
              {[6, 4, 7, 5, 8, 6].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t bg-emerald-500/70"
                  style={{ height: `${h * 9}%` }}
                />
              ))}
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="h-1 w-full rounded-full bg-slate-300" />
            <div className="h-1 w-3/4 rounded-full bg-slate-200" />
          </div>
        </div>
      );
    case 'two-column':
      return (
        <div className="grid h-full grid-cols-2 gap-1.5 p-2">
          <div className="space-y-1 rounded bg-slate-100 p-1">
            <div className="h-1 w-2/3 rounded-full bg-slate-300" />
            <div className="h-1 w-full rounded-full bg-slate-200" />
            <div className="h-1 w-4/5 rounded-full bg-slate-200" />
          </div>
          <div className="space-y-1 rounded bg-slate-100 p-1">
            <div className="h-1 w-2/3 rounded-full bg-slate-300" />
            <div className="h-1 w-full rounded-full bg-slate-200" />
            <div className="h-1 w-3/5 rounded-full bg-slate-200" />
          </div>
        </div>
      );
    case 'bullets':
      return (
        <div className="space-y-1.5 p-3">
          {layout.blocks.slice(0, 4).map((_b, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              <span className="h-1.5 flex-1 rounded-full bg-slate-200" />
            </div>
          ))}
        </div>
      );
    case 'summary':
      return (
        <div className="flex h-full flex-col justify-between p-2">
          <div className="space-y-1">
            <div className="h-2 w-1/2 rounded-full bg-blue-500" />
            <div className="h-1 w-full rounded-full bg-slate-200" />
            <div className="h-1 w-3/4 rounded-full bg-slate-200" />
          </div>
          <div className="grid grid-cols-3 gap-1">
            <div className="h-4 rounded bg-blue-200/60" />
            <div className="h-4 rounded bg-emerald-200/60" />
            <div className="h-4 rounded bg-amber-200/60" />
          </div>
        </div>
      );
  }
}

export function LayoutPreviewGrid({
  layout,
  onApply,
  selected = false,
}: LayoutPreviewGridProps): ReactElement {
  return (
    <button
      type="button"
      onClick={() => onApply?.(layout.id)}
      className={cn(
        'group flex flex-col gap-2 rounded-lg border bg-slate-900/60 p-2 text-left transition-colors',
        selected
          ? 'border-blue-500 ring-1 ring-blue-500/60'
          : 'border-slate-700/60 hover:border-blue-500/50',
      )}
      data-testid="layout-preview"
      data-layout-id={layout.id}
      data-layout-kind={layout.kind}
      aria-label={`Apply layout ${layout.title}`}
    >
      <div
        className={cn(
          'relative aspect-video w-full overflow-hidden rounded-md bg-white shadow-inner',
          accentClasses(layout.accentSlot),
        )}
      >
        {layoutBody(layout)}
        {layout.dataFocus && (
          <span className="absolute right-1 top-1 rounded bg-amber-500/90 px-1 text-[8px] font-semibold text-amber-950">
            data
          </span>
        )}
      </div>
      <div className="flex items-center justify-between px-1">
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-slate-200">{layout.title}</div>
          <div className="truncate text-[10px] text-slate-500">{layout.caption}</div>
        </div>
        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-slate-400">
          {layout.kind}
        </span>
      </div>
    </button>
  );
}
