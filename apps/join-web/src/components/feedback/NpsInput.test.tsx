/**
 * NpsInput tests — Wave 5 §S5.6.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NpsInput } from './NpsInput';

describe('NpsInput', () => {
  it('calls onChange when a button is clicked', () => {
    const onChange = vi.fn();
    render(<NpsInput value={null} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('nps-input-btn-9'));
    expect(onChange).toHaveBeenCalledWith(9);
  });

  it('renders the selected value with the active styling', () => {
    render(<NpsInput value={7} onChange={vi.fn()} />);
    const selected = screen.getByTestId('nps-input-btn-7');
    expect(selected.className).toContain('bg-blue-600');
    const neutral = screen.getByTestId('nps-input-btn-3');
    expect(neutral.className).toContain('bg-white');
  });

  it('renders 11 buttons (0..10)', () => {
    render(<NpsInput value={null} onChange={vi.fn()} />);
    for (let n = 0; n <= 10; n += 1) {
      expect(screen.getByTestId(`nps-input-btn-${n}`)).toBeInTheDocument();
    }
  });
});