/**
 * Creator console smoke test — proves a representative component renders.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sidebar } from './Sidebar';

describe('creator-console smoke', () => {
  it('renders the sidebar', () => {
    render(<Sidebar />);
    expect(screen.getByText('Listings')).toBeInTheDocument();
  });
});
