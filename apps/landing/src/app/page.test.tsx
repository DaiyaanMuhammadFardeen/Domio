/**
 * Landing smoke test — proves the home page renders.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import LandingHomePage from './page';

describe('landing smoke', () => {
  it('renders the hero', () => {
    render(<LandingHomePage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Domio' })).toBeInTheDocument();
  });
});
