/**
 * Admin console smoke test — proves a representative component renders
 * without throwing.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sidebar } from './Sidebar';

describe('admin-console smoke', () => {
  it('renders the sidebar', () => {
    render(<Sidebar />);
    expect(screen.getByText('Overview')).toBeInTheDocument();
  });
});
