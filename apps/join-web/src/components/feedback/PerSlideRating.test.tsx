/**
 * PerSlideRating tests — Wave 5 §S5.6.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PerSlideRating } from './PerSlideRating';

describe('PerSlideRating', () => {
  it('renders the default 3 slides', () => {
    render(<PerSlideRating ratings={{}} onChange={vi.fn()} />);
    expect(screen.getByTestId('per-slide-rating-row-slide-1')).toBeInTheDocument();
    expect(screen.getByTestId('per-slide-rating-row-slide-2')).toBeInTheDocument();
    expect(screen.getByTestId('per-slide-rating-row-slide-3')).toBeInTheDocument();
  });

  it('calls onChange("slide-2", 1) when thumbs up on slide-2 is clicked', () => {
    const onChange = vi.fn();
    render(<PerSlideRating ratings={{}} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('per-slide-rating-up-slide-2'));
    expect(onChange).toHaveBeenCalledWith('slide-2', 1);
  });

  it('clears the rating when the same thumb is clicked again', () => {
    const onChange = vi.fn();
    render(<PerSlideRating ratings={{ 'slide-1': 1 }} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('per-slide-rating-up-slide-1'));
    expect(onChange).toHaveBeenCalledWith('slide-1', 0);
  });

  it('calls onChange(slideId, -1) for thumbs down', () => {
    const onChange = vi.fn();
    render(<PerSlideRating ratings={{}} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('per-slide-rating-down-slide-3'));
    expect(onChange).toHaveBeenCalledWith('slide-3', -1);
  });
});
