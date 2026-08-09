import { clsx } from 'clsx';

export type BadgeTone = 'green' | 'yellow' | 'grey' | 'red' | 'brand' | 'amber';

export interface BadgeProps {
  tone?: BadgeTone;
  children: React.ReactNode;
}

/**
 * Pill badge lifted from dashboard. Tones map to Tailwind classes.
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

/** Map brand-lock state to badge tone. */
export function toneForBrandLock(state: string): BadgeTone {
  switch (state) {
    case 'allow':
      return 'green';
    case 'deny':
      return 'red';
    case 'override':
      return 'amber';
    default:
      return 'grey';
  }
}

/** Map takedown status to badge tone. */
export function toneForTakedownStatus(status: string): BadgeTone {
  switch (status) {
    case 'confirmed':
      return 'red';
    case 'dismissed':
      return 'green';
    case 'resolved':
      return 'green';
    case 'in_review':
      return 'amber';
    case 'counter_notice':
      return 'yellow';
    case 'received':
      return 'brand';
    default:
      return 'grey';
  }
}

/** Map takedown kind to badge tone. */
export function toneForTakedownKind(kind: string): BadgeTone {
  switch (kind) {
    case 'dmca':
      return 'red';
    case 'trademark':
      return 'amber';
    case 'policy':
      return 'yellow';
    default:
      return 'grey';
  }
}

/** Map payout run status to badge tone. */
export function toneForPayoutStatus(status: string): BadgeTone {
  switch (status) {
    case 'completed':
      return 'green';
    case 'processing':
      return 'brand';
    case 'pending':
      return 'yellow';
    case 'failed':
      return 'red';
    default:
      return 'grey';
  }
}

/** Map listing status to badge tone. */
export function toneForListingStatus(status: string): BadgeTone {
  switch (status) {
    case 'published':
      return 'green';
    case 'in_review':
      return 'amber';
    case 'draft':
      return 'grey';
    case 'deprecated':
      return 'yellow';
    case 'removed':
      return 'red';
    default:
      return 'grey';
  }
}
