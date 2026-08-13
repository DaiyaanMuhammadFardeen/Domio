import { clsx } from 'clsx';

export type BadgeTone = 'green' | 'yellow' | 'grey' | 'red' | 'brand' | 'amber';

export interface BadgeProps {
  tone?: BadgeTone;
  children: React.ReactNode;
}

/**
 * Pill component for status badges. Tones map to Tailwind classes so
 * callers don't have to remember utility names.
 */
export function Badge({ tone = 'grey', children }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        tone === 'green' && 'bg-emerald-50 text-emerald-700',
        tone === 'yellow' && 'bg-yellow-50 text-yellow-800',
        tone === 'amber' && 'bg-amber-50 text-amber-700',
        tone === 'red' && 'bg-rose-50 text-rose-700',
        tone === 'grey' && 'bg-slate-100 text-slate-600',
        tone === 'brand' && 'bg-brand-50 text-brand-700',
      )}
    >
      {children}
    </span>
  );
}

export function toneForStatus(status: string): BadgeTone {
  switch (status) {
    case 'significant':
      return 'green';
    case 'underpowered':
      return 'yellow';
    case 'inconclusive':
      return 'amber';
    case 'running':
      return 'brand';
    case 'archived':
      return 'grey';
    default:
      return 'grey';
  }
}
