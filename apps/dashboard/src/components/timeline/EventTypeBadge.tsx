'use client';

import { clsx } from 'clsx';
import type { SessionEventType } from '../../lib/timeline-service';

export interface EventTypeBadgeProps {
  type: SessionEventType;
  label: string;
  className?: string;
}

/**
 * Small badge that identifies the kind of session event on the
 * timeline (slide advance, scenario toggle, annotation, …).
 */
export function EventTypeBadge({ type, label, className }: EventTypeBadgeProps) {
  return (
    <span
      data-testid={`event-badge-${type}`}
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        toneForType(type),
        className,
      )}
    >
      {label}
    </span>
  );
}

export function toneForType(type: SessionEventType): string {
  switch (type) {
    case 'slide_advance':
      return 'bg-brand-50 text-brand-700';
    case 'scenario_toggle':
      return 'bg-amber-50 text-amber-700';
    case 'annotation':
      return 'bg-yellow-50 text-yellow-800';
    case 'poll_launch':
      return 'bg-purple-50 text-purple-700';
    case 'qa_submitted':
      return 'bg-emerald-50 text-emerald-700';
    case 'comment_added':
      return 'bg-sky-50 text-sky-700';
    case 'session_start':
      return 'bg-emerald-50 text-emerald-700';
    case 'session_end':
      return 'bg-rose-50 text-rose-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}
