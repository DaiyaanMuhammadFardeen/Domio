/**
 * Listing transitions tests (Phase 19 Wave 1).
 *
 * All 10 valid transitions + invalid cases.
 */

import { describe, it, expect } from 'vitest';
import {
  LISTING_TRANSITIONS,
  type ListingStatus,
} from './types.js';

describe('LISTING_TRANSITIONS', () => {
  // ---------------------------------------------------------------------------
  // Valid transitions (10 total)
  // ---------------------------------------------------------------------------

  it('draft → in_review (valid)', () => {
    expect(LISTING_TRANSITIONS.draft).toContain('in_review');
  });

  it('draft → removed (valid)', () => {
    expect(LISTING_TRANSITIONS.draft).toContain('removed');
  });

  it('in_review → published (valid)', () => {
    expect(LISTING_TRANSITIONS.in_review).toContain('published');
  });

  it('in_review → removed (valid)', () => {
    expect(LISTING_TRANSITIONS.in_review).toContain('removed');
  });

  it('in_review → draft (valid)', () => {
    expect(LISTING_TRANSITIONS.in_review).toContain('draft');
  });

  it('published → deprecated (valid)', () => {
    expect(LISTING_TRANSITIONS.published).toContain('deprecated');
  });

  it('published → removed (valid)', () => {
    expect(LISTING_TRANSITIONS.published).toContain('removed');
  });

  it('published → draft (valid)', () => {
    expect(LISTING_TRANSITIONS.published).toContain('draft');
  });

  it('deprecated → removed (valid)', () => {
    expect(LISTING_TRANSITIONS.deprecated).toContain('removed');
  });

  it('deprecated → draft (valid)', () => {
    expect(LISTING_TRANSITIONS.deprecated).toContain('draft');
  });

  // ---------------------------------------------------------------------------
  // Invalid transitions (removed has no transitions)
  // ---------------------------------------------------------------------------

  it('removed → [] (no transitions allowed)', () => {
    expect(LISTING_TRANSITIONS.removed).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Verify invalid transitions are NOT in the map
  // ---------------------------------------------------------------------------

  it('draft cannot go directly to published', () => {
    expect(LISTING_TRANSITIONS.draft).not.toContain('published');
  });

  it('draft cannot go directly to deprecated', () => {
    expect(LISTING_TRANSITIONS.draft).not.toContain('deprecated');
  });

  it('in_review cannot go directly to deprecated', () => {
    expect(LISTING_TRANSITIONS.in_review).not.toContain('deprecated');
  });

  it('published cannot go directly to in_review', () => {
    expect(LISTING_TRANSITIONS.published).not.toContain('in_review');
  });

  it('deprecated cannot go to published', () => {
    expect(LISTING_TRANSITIONS.deprecated).not.toContain('published');
  });

  it('deprecated cannot go to in_review', () => {
    expect(LISTING_TRANSITIONS.deprecated).not.toContain('in_review');
  });

  // ---------------------------------------------------------------------------
  // All statuses are covered
  // ---------------------------------------------------------------------------

  it('covers all 5 listing statuses', () => {
    const statuses: ListingStatus[] = ['draft', 'in_review', 'published', 'deprecated', 'removed'];
    for (const status of statuses) {
      expect(LISTING_TRANSITIONS).toHaveProperty(status);
      expect(Array.isArray(LISTING_TRANSITIONS[status])).toBe(true);
    }
  });
});
