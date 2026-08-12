/**
 * Marketplace smoke test — proves a representative component renders
 * without throwing.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Header } from './Header';

describe('marketplace-web smoke', () => {
  it('renders the marketplace header', () => {
    render(<Header />);
    expect(screen.getByLabelText(/domio marketplace/i)).toBeInTheDocument();
  });
});
