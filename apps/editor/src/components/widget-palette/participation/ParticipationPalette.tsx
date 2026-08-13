'use client';

import { PARTICIPATION_WIDGETS, type WidgetPaletteEntry } from './widget-defs';

export interface ParticipationPaletteProps {
  readonly onInsert: (entry: WidgetPaletteEntry) => void;
  readonly disabled?: boolean;
}

export function ParticipationPalette(props: ParticipationPaletteProps) {
  return (
    <section className="p-3" data-testid="participation-palette">
      <h2 className="text-xs font-bold uppercase text-slate-500 mb-2">Participation</h2>
      <ul className="grid grid-cols-2 gap-2">
        {PARTICIPATION_WIDGETS.map((w) => (
          <li key={w.type}>
            <button
              type="button"
              className="w-full p-2 rounded border bg-white hover:bg-blue-50 text-left disabled:opacity-50"
              disabled={props.disabled}
              onClick={() => props.onInsert(w)}
              data-testid={`palette-${w.type}`}
            >
              <span className="text-2xl mr-2">{w.emoji}</span>
              <span className="text-sm font-medium">{w.label}</span>
              <p className="text-xs text-slate-500 mt-1">{w.description}</p>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
