/**
 * CreatorProfileHeader — Wave 9 S9.9.
 *
 * Header block for a per-creator profile page: avatar (initials),
 * display name, handle, bio, follow button, joined date, location.
 */

'use client';

import { useState } from 'react';
import type { CreatorProfile } from '@/lib/creator-service';
import { useLocale } from '@/hooks/useLocale';

interface CreatorProfileHeaderProps {
  readonly creator: CreatorProfile;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function formatJoinedDate(ts: number, locale: string): string {
  try {
    return new Date(ts).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
    });
  } catch {
    return new Date(ts).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
    });
  }
}

export function CreatorProfileHeader({ creator }: CreatorProfileHeaderProps) {
  const { t, locale } = useLocale();
  const [following, setFollowing] = useState(false);

  const initials = getInitials(creator.display_name);
  const joinedDate = formatJoinedDate(creator.joined_at_ms, locale);

  return (
    <header
      className="flex flex-col gap-6 border-b border-border pb-10 sm:flex-row sm:items-start"
      data-testid="creator-profile-header"
    >
      <div
        className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent/40 to-purple-500/30 font-display text-3xl font-bold text-white sm:h-28 sm:w-28"
        aria-hidden="true"
      >
        {initials}
      </div>

      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-bold text-fg">{creator.display_name}</h1>
            <p className="mt-1 text-sm text-muted">@{creator.handle}</p>
          </div>

          <button
            type="button"
            onClick={() => setFollowing((v) => !v)}
            aria-pressed={following}
            className={`rounded-xl border px-5 py-2 text-sm font-semibold transition-all ${
              following
                ? 'border-accent/40 bg-accent/10 text-accent'
                : 'border-border bg-panel text-fg hover:border-accent/40 hover:text-accent'
            }`}
          >
            {following ? 'Following' : t('market.creator.follow')}
          </button>
        </div>

        <p className="max-w-2xl text-sm leading-relaxed text-fg/80">{creator.bio}</p>

        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
          <span>{creator.location}</span>
          <span>{t('market.creator.joined', { date: joinedDate })}</span>
        </div>
      </div>
    </header>
  );
}
