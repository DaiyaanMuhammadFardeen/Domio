import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import React from 'react';
import { EmptyState } from './EmptyState.js';

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState title="Nothing here" description="Maybe later" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.getByText('Maybe later')).toBeInTheDocument();
  });

  it('renders an action button when provided', () => {
    render(
      <EmptyState
        title="No decks"
        action={{ label: 'Create deck', onClick: () => undefined }}
      />,
    );
    const btn = screen.getByRole('button', { name: /create deck/i });
    expect(btn).toBeInTheDocument();
  });

  it('renders an action link with href when provided', () => {
    render(
      <EmptyState
        title="No decks"
        action={{ label: 'Open docs', href: '/docs' }}
      />,
    );
    const link = screen.getByRole('link', { name: /open docs/i });
    expect(link).toHaveAttribute('href', '/docs');
  });
});
