/**
 * Sanity tests for the changelog data layer.
 *
 * Wave 12 §S12.5 — verifies:
 *  - the catalog is non-empty with at least 8 entries
 *  - entries are sorted newest-first (descending by date)
 *  - at least one entry carries a breaking-change flag
 *  - every entry has a valid semantic version and a non-empty
 *    highlights array
 *  - migration guide links, when present, point at the docs route
 */

import { describe, expect, it } from 'vitest';
import { CHANGELOG, type ChangelogEntry } from './changelog-data';

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?$/;

function isSortedNewestFirst(entries: ReadonlyArray<ChangelogEntry>): boolean {
  for (let i = 1; i < entries.length; i += 1) {
    const prev = entries[i - 1]!.date_iso;
    const curr = entries[i]!.date_iso;
    // Lexicographic compare on ISO dates is correct for `YYYY-MM-DD`.
    if (prev < curr) return false;
  }
  return true;
}

describe('changelog-data', () => {
  it('exports a non-empty CHANGELOG list', () => {
    expect(CHANGELOG.length).toBeGreaterThan(0);
  });

  it('has at least 8 entries', () => {
    expect(CHANGELOG.length).toBeGreaterThanOrEqual(8);
  });

  it('is sorted newest-first by date_iso', () => {
    expect(isSortedNewestFirst(CHANGELOG)).toBe(true);
  });

  it('contains at least one entry with breaking_changes', () => {
    const hasBreaking = CHANGELOG.some(
      (e) =>
        Array.isArray(e.breaking_changes) &&
        (e.breaking_changes as ReadonlyArray<string>).length > 0,
    );
    expect(hasBreaking).toBe(true);
  });

  it.each(CHANGELOG.map((e) => e.version))(
    'entry %s has a valid semver version',
    (version) => {
      expect(SEMVER_RE.test(version)).toBe(true);
    },
  );

  it.each(CHANGELOG.map((e) => e.version))(
    'entry %s has at least one highlight',
    (version) => {
      const entry = CHANGELOG.find((e) => e.version === version);
      expect(entry, `entry ${version} should exist`).toBeDefined();
      expect(entry!.highlights.length).toBeGreaterThanOrEqual(3);
    },
  );

  it.each(CHANGELOG.map((e) => e.version))(
    'entry %s has a non-empty ISO date',
    (version) => {
      const entry = CHANGELOG.find((e) => e.version === version);
      expect(entry).toBeDefined();
      expect(entry!.date_iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    },
  );

  it('migration_guide_href values point at the docs route when present', () => {
    for (const entry of CHANGELOG) {
      if (entry.migration_guide_href !== undefined) {
        expect(entry.migration_guide_href.startsWith('/docs/')).toBe(true);
      }
    }
  });
});