import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RemoteEntry } from './remote-entry.js';
import type { TimelineEntry } from './timeline.js';

const ENTRY: TimelineEntry = {
  id: 'r1',
  kind: 'remote',
  timestamp: '2026-08-01T10:00:00Z',
  author: { id: 'u2', name: 'Bea', avatarUrl: 'https://example.test/bea.png' },
  label: 'Add chart',
};

describe('RemoteEntry', () => {
  it('renders the avatar and label', () => {
    render(<RemoteEntry entry={ENTRY} />);
    expect(screen.getByText('Add chart')).toBeInTheDocument();
    expect(screen.getByAltText('')).toHaveAttribute('src', 'https://example.test/bea.png');
  });

  it('invokes onGoToState when clicked', () => {
    const handler = vi.fn();
    render(<RemoteEntry entry={ENTRY} onGoToState={handler} />);
    fireEvent.click(screen.getByRole('button', { name: 'Go to state' }));
    expect(handler).toHaveBeenCalledWith(ENTRY);
  });
});