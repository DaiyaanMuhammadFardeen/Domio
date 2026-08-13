/**
 * StarRating tests — Wave 5 §S5.6.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { StarRating } from './StarRating';

describe('StarRating', () => {
  it('renders filled stars up to the supplied value', () => {
    render(<StarRating value={3} onChange={vi.fn()} />);
    expect(screen.getByTestId('star-rating-star-1').className).toContain('text-yellow-500');
    expect(screen.getByTestId('star-rating-star-2').className).toContain('text-yellow-500');
    expect(screen.getByTestId('star-rating-star-3').className).toContain('text-yellow-500');
    expect(screen.getByTestId('star-rating-star-4').className).toContain('text-slate-300');
    expect(screen.getByTestId('star-rating-star-5').className).toContain('text-slate-300');
  });

  it('calls onChange with the clicked star value', () => {
    const onChange = vi.fn();
    render(<StarRating value={2} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('star-rating-star-5'));
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it('respects a custom data-testid', () => {
    render(<StarRating value={0} onChange={vi.fn()} dataTestId="custom-stars" />);
    expect(screen.getByTestId('custom-stars')).toBeInTheDocument();
    expect(screen.getByTestId('custom-stars-star-1')).toBeInTheDocument();
  });
});