/**
 * Landing smoke test — proves the home page renders.
 *
 * Wave 12 §S12.1 swapped the stub for a full marketing page. The hero
 * heading now markets the platform, not the brand name, so we assert
 * on the marketing testid instead.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import LandingHomePage from './page';

describe('landing smoke', () => {
  it('renders the hero section', () => {
    render(<LandingHomePage />);
    expect(screen.getByTestId('hero')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /decks that react, present, and ship themselves/i,
      }),
    ).toBeInTheDocument();
  });

  it('renders every marketing section', () => {
    render(<LandingHomePage />);
    // Use queryAllByTestId + length to be robust to potential layout-
    // rendered duplicates (e.g. SiteFooter/Header sharing a testid).
    const testids = [
      'customers-section',
      'features-section',
      'how-it-works',
      'pricing-section',
      'faq-section',
      'marketing-footer',
    ];
    for (const id of testids) {
      expect(
        screen.queryAllByTestId(id).length,
        `expected at least one [data-testid="${id}"]`,
      ).toBeGreaterThanOrEqual(1);
    }
  });
});
