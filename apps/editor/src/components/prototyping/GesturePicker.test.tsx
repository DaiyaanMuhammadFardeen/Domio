/**
 * GesturePicker — Wave 2 §S2.12 unit tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GesturePicker } from './GesturePicker';

describe('GesturePicker', () => {
  it('renders all gestures by default', () => {
    render(<GesturePicker value={[]} onChange={vi.fn()} />);
    expect(screen.getByTestId('gesture-click')).toBeInTheDocument();
    expect(screen.getByTestId('gesture-swipeLeft')).toBeInTheDocument();
  });

  it('shows checked state for selected gestures', () => {
    render(<GesturePicker value={['click']} onChange={vi.fn()} />);
    expect(screen.getByTestId('gesture-click').textContent).toMatch(/Click/);
  });

  it('emits onChange when a gesture is toggled on', () => {
    const onChange = vi.fn();
    render(<GesturePicker value={[]} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('gesture-click'));
    expect(onChange).toHaveBeenCalledWith(['click']);
  });

  it('emits onChange removing a gesture on second click', () => {
    const onChange = vi.fn();
    render(<GesturePicker value={['click', 'hover']} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('gesture-click'));
    expect(onChange).toHaveBeenCalledWith(['hover']);
  });
});
