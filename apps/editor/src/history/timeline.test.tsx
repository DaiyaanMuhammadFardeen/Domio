import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Timeline, type TimelineEntry } from './timeline.js';

const ENTRIES: TimelineEntry[] = [
  {
    id: '1',
    kind: 'local',
    timestamp: '2026-08-01T10:00:00Z',
    author: { id: 'u1', name: 'Ada' },
    label: 'Move logo',
  },
  {
    id: '2',
    kind: 'checkpoint',
    timestamp: '2026-08-01T10:05:00Z',
    author: { id: 'u1', name: 'Ada' },
    label: 'v1.0',
  },
];

describe('Timeline', () => {
  it('renders one row per entry with author and label', () => {
    render(<Timeline entries={ENTRIES} />);
    expect(screen.getByText('Move logo')).toBeInTheDocument();
    expect(screen.getByText('v1.0')).toBeInTheDocument();
    expect(screen.getAllByText('Ada').length).toBeGreaterThanOrEqual(1);
  });

  it('invokes onGoToState for a row', () => {
    const handler = vi.fn();
    render(<Timeline entries={ENTRIES} onGoToState={handler} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Go to this state' })[0]!);
    expect(handler).toHaveBeenCalledWith(ENTRIES[0]);
  });
});
