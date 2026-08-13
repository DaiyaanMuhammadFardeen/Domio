'use client';

import { useLocale } from '@/hooks/useLocale';
import type { ChangelogEntry } from '@/lib/types';

interface ChangelogTimelineProps {
  entries: ChangelogEntry[];
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function ChangelogTimeline({ entries }: ChangelogTimelineProps) {
  const { t } = useLocale();

  if (entries.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-muted">{t('detail.changelog')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h3 className="font-display text-base font-semibold text-fg">{t('detail.changelog')}</h3>

      <div className="relative ml-3 border-l-2 border-border pl-6">
        {entries.map((entry, idx) => (
          <div key={entry.version} className="relative pb-8 last:pb-0">
            {/* Dot on timeline */}
            <div
              className={`absolute -left-[31px] top-1 h-3 w-3 rounded-full border-2 ${
                idx === 0 ? 'border-accent bg-accent' : 'border-border bg-panel'
              }`}
              aria-hidden="true"
            />

            <div className="flex flex-wrap items-baseline gap-x-3">
              <span className="font-mono text-sm font-semibold text-fg">v{entry.version}</span>
              <time
                className="text-xs text-muted"
                dateTime={new Date(entry.created_at).toISOString()}
              >
                {formatDate(entry.created_at)}
              </time>
            </div>

            <p className="mt-2 text-sm leading-relaxed text-fg/70">{entry.changelog}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
