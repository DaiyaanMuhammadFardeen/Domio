/**
 * FiltersPanel — Wave 2 §S2.7 apply-to-all-slides.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FiltersPanel } from './filters-panel.js';
import type { CrossFilter } from '@domio/canvas';

const filter: CrossFilter = {
  id: 'filter-1',
  dimension: 'region',
  value: 'NA',
};

describe('FiltersPanel — apply-to-all-slides', () => {
  it('renders an apply-all button for each filter', () => {
    render(<FiltersPanel filters={[filter]} onChange={vi.fn()} onApplyAllSlides={vi.fn()} />);
    expect(screen.getByTestId('p08-filter-apply-all-filter-1')).toBeInTheDocument();
  });

  it('calls onApplyAllSlides with the filter when the button is clicked', () => {
    const onApplyAll = vi.fn();
    render(<FiltersPanel filters={[filter]} onChange={vi.fn()} onApplyAllSlides={onApplyAll} />);
    fireEvent.click(screen.getByTestId('p08-filter-apply-all-filter-1'));
    expect(onApplyAll).toHaveBeenCalledWith(filter);
  });

  it('does not call onApplyAllSlides if not provided', () => {
    render(<FiltersPanel filters={[filter]} onChange={vi.fn()} />);
    // Should not throw
    fireEvent.click(screen.getByTestId('p08-filter-apply-all-filter-1'));
  });
});
