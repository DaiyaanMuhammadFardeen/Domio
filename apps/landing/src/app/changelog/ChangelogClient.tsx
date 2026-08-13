/**
 * Client wrapper for the changelog page.
 *
 * Wave 12 §S12.5 — owns the filter state. The page itself is a
 * server component that ships the full catalog; this client
 * component decides which subset to render based on the active
 * filter.
 *
 * Filtering is done by `ChangelogCategory`:
 *   - feature  → show entries that have at least one highlight
 *   - fix      → show entries that have at least one fix
 *   - breaking → show entries that have at least one breaking change
 *   - all      → show every entry (default)
 *
 * The filter chip counts are computed against the full catalog so the
 * badges don't change as the user toggles categories.
 */

'use client';

import { useMemo, useState, type JSX } from 'react';
import { ReleaseFilter, type ChangelogFilter } from '../../components/changelog/ReleaseFilter';
import { ReleaseEntry } from '../../components/changelog/ReleaseEntry';
import type { ChangelogEntry } from '../../lib/changelog-data';

export interface ChangelogClientProps {
  readonly entries: ReadonlyArray<ChangelogEntry>;
}

function hasFixes(e: ChangelogEntry): boolean {
  return Array.isArray(e.fixes) && (e.fixes as ReadonlyArray<string>).length > 0;
}

function hasBreaking(e: ChangelogEntry): boolean {
  return (
    Array.isArray(e.breaking_changes) && (e.breaking_changes as ReadonlyArray<string>).length > 0
  );
}

function matchesFilter(entry: ChangelogEntry, filter: ChangelogFilter): boolean {
  if (filter === 'all') return true;
  if (filter.has('breaking') && hasBreaking(entry)) return true;
  if (filter.has('fix') && hasFixes(entry)) return true;
  if (filter.has('feature') && entry.highlights.length > 0) return true;
  return false;
}

export function ChangelogClient({ entries }: ChangelogClientProps): JSX.Element {
  const [filter, setFilter] = useState<ChangelogFilter>('all');

  const featureCount = useMemo(
    () => entries.filter((e) => e.highlights.length > 0).length,
    [entries],
  );
  const fixCount = useMemo(() => entries.filter(hasFixes).length, [entries]);
  const breakingCount = useMemo(() => entries.filter(hasBreaking).length, [entries]);

  const visible = useMemo(() => entries.filter((e) => matchesFilter(e, filter)), [entries, filter]);

  return (
    <div className="cl-page__body">
      <ReleaseFilter
        value={filter}
        onChange={setFilter}
        featureCount={featureCount}
        fixCount={fixCount}
        breakingCount={breakingCount}
      />

      {visible.length === 0 ? (
        <p className="cl-empty" data-testid="changelog-empty">
          No releases match this filter yet.
        </p>
      ) : (
        <div className="cl-list" data-testid="changelog-list" data-visible-count={visible.length}>
          {visible.map((entry) => (
            <ReleaseEntry key={entry.version} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

export default ChangelogClient;
