'use client';

/**
 * ListenerStatus — top-bar widget showing the listener state.
 *
 * Per Wave 11 §S11.10. A pill that reads "Listener: ON" / "Listener: OFF".
 * Click to toggle. When active, displays the current match count.
 */

import { useCallback } from 'react';

export interface ListenerStatusProps {
  enabled: boolean;
  matchCount: number;
  onToggle: () => void;
  className?: string;
}

export function ListenerStatus({ enabled, matchCount, onToggle, className }: ListenerStatusProps) {
  const handleClick = useCallback(() => {
    onToggle();
  }, [onToggle]);

  const label = enabled ? 'Listener: ON' : 'Listener: OFF';
  const tone = enabled ? 'on' : 'off';

  return (
    <button
      type="button"
      onClick={handleClick}
      data-testid="listener-status"
      data-listener-state={tone}
      aria-pressed={enabled}
      className={[
        'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium',
        enabled
          ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
          : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span
        aria-hidden="true"
        className={[
          'inline-block h-2 w-2 rounded-full',
          enabled ? 'bg-emerald-500' : 'bg-zinc-400',
        ].join(' ')}
      />
      <span data-testid="listener-status-label">{label}</span>
      {enabled && matchCount > 0 ? (
        <span
          data-testid="listener-status-count"
          className="ml-1 rounded-full bg-white/70 px-2 py-0.5 text-[10px] text-emerald-900"
        >
          {matchCount} match{matchCount === 1 ? '' : 'es'}
        </span>
      ) : null}
    </button>
  );
}
