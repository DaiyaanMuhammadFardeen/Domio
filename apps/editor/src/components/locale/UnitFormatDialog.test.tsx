/**
 * UnitFormatDialog — Wave 2 §S2.9 unit tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UnitFormatDialog, defaultUnitFormatValue } from './UnitFormatDialog';

describe('UnitFormatDialog', () => {
  it('returns null when closed', () => {
    const { container } = render(
      <UnitFormatDialog
        open={false}
        initial={defaultUnitFormatValue()}
        onCancel={vi.fn()}
        onApply={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the dialog body when open', () => {
    render(
      <UnitFormatDialog
        open
        initial={defaultUnitFormatValue()}
        onCancel={vi.fn()}
        onApply={vi.fn()}
      />,
    );
    expect(screen.getByTestId('unit-format-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('unit-format-preview')).toBeInTheDocument();
  });

  it('fires onApply with the chosen config', () => {
    const onApply = vi.fn();
    render(
      <UnitFormatDialog
        open
        initial={defaultUnitFormatValue()}
        onCancel={vi.fn()}
        onApply={onApply}
      />,
    );
    fireEvent.click(screen.getByTestId('unit-format-apply'));
    expect(onApply).toHaveBeenCalledTimes(1);
    const arg = onApply.mock.calls[0]?.[0];
    expect(arg).toMatchObject({ style: 'decimal' });
    expect(arg.locale).toBeTruthy();
  });

  it('fires onCancel when cancel is clicked', () => {
    const onCancel = vi.fn();
    render(
      <UnitFormatDialog
        open
        initial={defaultUnitFormatValue()}
        onCancel={onCancel}
        onApply={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('switches to currency style and includes the currency on apply', () => {
    const onApply = vi.fn();
    render(
      <UnitFormatDialog
        open
        initial={defaultUnitFormatValue()}
        sampleValue={100}
        onCancel={vi.fn()}
        onApply={onApply}
      />,
    );
    fireEvent.click(screen.getByLabelText('Currency'));
    fireEvent.click(screen.getByTestId('unit-format-apply'));
    const arg = onApply.mock.calls[0]?.[0];
    expect(arg).toMatchObject({ style: 'currency' });
    expect(arg.currency).toBeTruthy();
  });
});
