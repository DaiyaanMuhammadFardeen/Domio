/**
 * Single release card for the changelog page.
 *
 * Wave 12 §S12.5 — renders one `ChangelogEntry` as a vertical card
 * with a header (version + date), a "Highlights" list, an optional
 * "Fixes" list, a distinct "Breaking changes" visual block when the
 * entry has them, and an optional migration-guide link.
 *
 * The component is server-renderable (no client hooks) so the page
 * can stream the catalog with the filter as the only interactive
 * surface.
 */

import type { JSX } from 'react';
import { landing } from '@domio/ui';
import type { ChangelogEntry } from '../../lib/changelog-data';

export interface ReleaseEntryProps {
  readonly entry: ChangelogEntry;
}

function formatDate(iso: string): string {
  // `Date(...)` is fine here — the input is a literal YYYY-MM-DD
  // string and we only format it for display.
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function ReleaseEntry({ entry }: ReleaseEntryProps): JSX.Element {
  const hasBreaking =
    Array.isArray(entry.breaking_changes) &&
    (entry.breaking_changes as ReadonlyArray<string>).length > 0;
  const hasFixes = Array.isArray(entry.fixes) && (entry.fixes as ReadonlyArray<string>).length > 0;

  const migrationHref =
    entry.migration_guide_href ??
    (hasBreaking ? landing('docs', { slug: 'migrations' }) : undefined);

  return (
    <article
      className={'cl-release' + (hasBreaking ? ' cl-release--breaking' : '')}
      data-testid="changelog-entry"
      data-version={entry.version}
    >
      <header className="cl-release__header">
        <div className="cl-release__heading">
          <h2 className="cl-release__version">{entry.version}</h2>
          <time className="cl-release__date" dateTime={entry.date_iso}>
            {formatDate(entry.date_iso)}
          </time>
        </div>
        {hasBreaking ? (
          <span className="cl-release__breaking-tag" aria-label="Breaking changes">
            Breaking
          </span>
        ) : null}
      </header>

      <section className="cl-release__section" aria-labelledby={`cl-${entry.version}-highlights`}>
        <h3 id={`cl-${entry.version}-highlights`} className="cl-release__section-heading">
          Highlights
        </h3>
        <ul className="cl-release__list cl-release__list--highlights">
          {entry.highlights.map((line, i) => (
            <li key={i} className="cl-release__list-item">
              {line}
            </li>
          ))}
        </ul>
      </section>

      {hasBreaking ? (
        <section
          className="cl-release__breaking"
          aria-labelledby={`cl-${entry.version}-breaking`}
          data-testid="changelog-breaking"
        >
          <h3 id={`cl-${entry.version}-breaking`} className="cl-release__breaking-heading">
            Breaking changes
          </h3>
          <ul className="cl-release__breaking-list">
            {entry.breaking_changes!.map((line, i) => (
              <li key={i} className="cl-release__breaking-item">
                <span className="cl-release__breaking-bullet" aria-hidden="true">
                  !
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {hasFixes ? (
        <section className="cl-release__section" aria-labelledby={`cl-${entry.version}-fixes`}>
          <h3 id={`cl-${entry.version}-fixes`} className="cl-release__section-heading">
            Fixes
          </h3>
          <ul className="cl-release__list cl-release__list--fixes">
            {entry.fixes!.map((line, i) => (
              <li key={i} className="cl-release__list-item">
                {line}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {migrationHref ? (
        <footer className="cl-release__footer">
          <a
            className="cl-release__migration"
            href={migrationHref}
            data-testid="changelog-migration"
          >
            Read the migration guide →
          </a>
        </footer>
      ) : null}
    </article>
  );
}

export default ReleaseEntry;
