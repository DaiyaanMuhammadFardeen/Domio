/**
 * CreatorCard — Wave 9 S9.9.
 *
 * Reusable creator card with avatar (initials), display name, handle,
 * and a small stats snippet. Used in the /sellers featured grid.
 */

import Link from 'next/link';
import type { CreatorProfile } from '@/lib/creator-service';
import { marketplaceWeb } from '@domio/ui/routing';

interface CreatorCardProps {
  readonly creator: CreatorProfile;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function CreatorCard({ creator }: CreatorCardProps) {
  const initials = getInitials(creator.display_name);

  return (
    <Link
      href={marketplaceWeb('creator', { handle: creator.handle })}
      className="group flex flex-col gap-4 rounded-2xl border border-border bg-panel p-5 transition-all hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-lg hover:shadow-accent/5"
      data-testid={`creator-card-${creator.handle}`}
    >
      <div className="flex items-center gap-4">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent/40 to-purple-500/30 font-display text-base font-bold text-white"
          aria-hidden="true"
        >
          {initials}
        </div>
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-semibold text-fg transition-colors group-hover:text-accent">
            {creator.display_name}
          </p>
          <p className="truncate text-xs text-muted">@{creator.handle}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-border pt-3">
        <div>
          <p className="font-display text-sm font-semibold text-fg">
            {creator.listing_count}
          </p>
          <p className="text-[10px] uppercase tracking-wider text-muted">
            Listings
          </p>
        </div>
        <div>
          <p className="font-display text-sm font-semibold text-fg">
            {creator.total_sales.toLocaleString('en-US')}
          </p>
          <p className="text-[10px] uppercase tracking-wider text-muted">
            Sales
          </p>
        </div>
        <div>
          <p className="font-display text-sm font-semibold text-gold">
            {creator.avg_rating.toFixed(1)}★
          </p>
          <p className="text-[10px] uppercase tracking-wider text-muted">
            Rating
          </p>
        </div>
      </div>
    </Link>
  );
}