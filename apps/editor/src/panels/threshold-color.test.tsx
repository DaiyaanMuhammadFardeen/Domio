/**
 * ThresholdPanel — Wave 2 §S2.7 color override.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThresholdPanel } from './threshold-panel.js';
import type { ThresholdRule } from '../lib/live-data-store.js';

const rule: ThresholdRule = {
  id: 'thr-1',
  measure: 'value',
  comparator: 'gt',
  values: [0],
  severity: 'info',
  styleOverride: {},
};

describe('ThresholdPanel — color override', () => {
  it('renders a color input per rule', () => {
    render(<ThresholdPanel rules={[rule]} onChange={vi.fn()} />);
    expect(screen.getByTestId('p08-threshold-color-thr-1')).toBeInTheDocument();
  });

  it('emits onChange with a styleOverride patch when the color changes', () => {
    const onChange = vi.fn();
    render(<ThresholdPanel rules={[rule]} onChange={onChange} />);
    const input = screen.getByTestId('p08-threshold-color-thr-1') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '#ff0000' } });
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as ThresholdRule[];
    expect(next[0]!.styleOverride).toEqual({ color: '#ff0000' });
  });

  it('pre-fills the color input from styleOverride', () => {
    const styled: ThresholdRule = {
      ...rule,
      styleOverride: { color: '#abcdef' },
    };
    render(<ThresholdPanel rules={[styled]} onChange={vi.fn()} />);
    const input = screen.getByTestId('p08-threshold-color-thr-1') as HTMLInputElement;
    expect(input.value).toBe('#abcdef');
  });

  it('still renders without a color override', () => {
    render(<ThresholdPanel rules={[rule]} onChange={vi.fn()} />);
    expect(screen.getByTestId('p08-threshold-row-thr-1')).toBeInTheDocument();
  });
});