import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConflictResolver } from './conflict-resolver.js';
import type { DiffConflict } from './types.js';

const CONFLICTS: DiffConflict[] = [
  { slideId: 's1', elementId: 'e1', path: '/text', sourceValue: 'A', targetValue: 'B', baseValue: '' },
];

describe('ConflictResolver', () => {
  it('renders one row per conflict', () => {
    render(<ConflictResolver conflicts={CONFLICTS} values={{}} onChange={() => undefined} />);
    expect(screen.getByText('/text')).toBeInTheDocument();
  });

  it('records manual values', () => {
    const onChange = vi.fn();
    render(<ConflictResolver conflicts={CONFLICTS} values={{}} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Theirs' }));
    const last = onChange.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(Object.values(last)[0]).toBe('A');
  });
});