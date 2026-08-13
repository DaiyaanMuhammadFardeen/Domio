/**
 * ConditionalLogicBuilder — Wave 2 §S2.12 unit tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConditionalLogicBuilder } from './ConditionalLogicBuilder';

describe('ConditionalLogicBuilder', () => {
  it('renders the builder', () => {
    render(<ConditionalLogicBuilder onChange={vi.fn()} />);
    expect(screen.getByTestId('prototyping-conditional')).toBeInTheDocument();
    expect(screen.getByTestId('conditional-group-op')).toBeInTheDocument();
    expect(screen.getByTestId('conditional-source')).toBeInTheDocument();
  });

  it('shows the canonical compiled source', () => {
    render(<ConditionalLogicBuilder onChange={vi.fn()} />);
    const src = screen.getByTestId('conditional-source').textContent ?? '';
    expect(src).toContain('var.foo');
    expect(src).toContain('==');
    expect(src).toContain('bar');
  });

  it('adds a clause', () => {
    render(<ConditionalLogicBuilder onChange={vi.fn()} />);
    const beforeCount = screen.getAllByTestId(/^conditional-clause-/).length;
    fireEvent.click(screen.getByTestId('conditional-add'));
    const afterCount = screen.getAllByTestId(/^conditional-clause-/).length;
    expect(afterCount).toBe(beforeCount + 1);
  });

  it('changes group operator and emits onChange', () => {
    const onChange = vi.fn();
    render(<ConditionalLogicBuilder onChange={onChange} />);
    fireEvent.change(screen.getByTestId('conditional-group-op'), { target: { value: 'OR' } });
    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]![0] as { op: string };
    expect(lastCall.op).toBe('OR');
  });
});
