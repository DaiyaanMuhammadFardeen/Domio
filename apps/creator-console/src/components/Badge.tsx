import { clsx } from 'clsx';

export type BadgeTone = 'green' | 'yellow' | 'grey' | 'red' | 'brand' | 'amber' | 'blue' | 'orange';

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
        tone === 'blue' && 'bg-blue-50 text-blue-700',
        tone === 'orange' && 'bg-orange-50 text-orange-700',
      )}
    >
      {children}
    </span>
  );
}

export function toneForListingStatus(status: string): BadgeTone {
  switch (status) {
    case 'draft':
      return 'grey';
    case 'in_review':
      return 'amber';
    case 'published':
      return 'green';
    case 'deprecated':
      return 'orange';
    case 'removed':
      return 'red';
    default:
      return 'grey';
  }
}

export function toneForKycStatus(status: string): BadgeTone {
  switch (status) {
    case 'approved':
      return 'green';
    case 'pending':
      return 'amber';
    case 'rejected':
      return 'red';
    case 'expired':
      return 'orange';
    default:
      return 'grey';
  }
}