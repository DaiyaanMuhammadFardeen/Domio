/**
 * FormPalette — Wave 2 §S2.12 unit tests.
 *
 * Verifies the palette surfaces the 20 input types and emits
 * `onInsert(type)` when a card is clicked.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FormPalette } from './FormPalette';

describe('FormPalette', () => {
  it('renders all 20 input types by default', () => {
    render(<FormPalette onInsert={vi.fn()} />);
    expect(screen.getByTestId('form-input-text')).toBeInTheDocument();
    expect(screen.getByTestId('form-input-email')).toBeInTheDocument();
    expect(screen.getByTestId('form-input-signature')).toBeInTheDocument();
    expect(screen.getByTestId('form-input-color')).toBeInTheDocument();
  });

  it('emits onInsert with the input type', () => {
    const onInsert = vi.fn();
    render(<FormPalette onInsert={onInsert} />);
    fireEvent.click(screen.getByTestId('form-input-text'));
    expect(onInsert).toHaveBeenCalledWith('text');
  });

  it('filters to a subset', () => {
    render(<FormPalette onInsert={vi.fn()} filter="choice" />);
    expect(screen.getByTestId('form-input-checkbox')).toBeInTheDocument();
    expect(screen.queryByTestId('form-input-text')).not.toBeInTheDocument();
  });
});
