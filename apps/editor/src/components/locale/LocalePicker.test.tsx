/**
 * LocalePicker — Wave 2 §S2.9 unit tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LocalePicker } from './LocalePicker';

describe('LocalePicker', () => {
  it('renders the locale select', () => {
    render(<LocalePicker value="en-US" onChange={vi.fn()} />);
    expect(screen.getByTestId('locale-picker')).toBeInTheDocument();
  });

  it('renders the preview chip with a formatted sample value', () => {
    render(<LocalePicker value="en-US" onChange={vi.fn()} sampleValue={1234.56} />);
    const preview = screen.getByTestId('locale-picker-preview');
    expect(preview.textContent).toContain('1,234.56');
  });

  it('re-formats the preview when the locale changes', () => {
    render(
      <LocalePicker
        value="de-DE"
        onChange={vi.fn()}
        sampleValue={1234.56}
        withCurrency
        currency="EUR"
      />,
    );
    const preview = screen.getByTestId('locale-picker-preview');
    // German locale uses '.' as thousands separator.
    expect(preview.textContent).toContain('1.234');
  });

  it('fires onChange when the locale select changes', () => {
    const onChange = vi.fn();
    render(<LocalePicker value="en-US" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Locale'), { target: { value: 'fr-FR' } });
    expect(onChange).toHaveBeenCalledWith('fr-FR');
  });

  it('groups locales by region when groupByRegion is enabled', () => {
    render(<LocalePicker value="en-US" onChange={vi.fn()} groupByRegion />);
    const select = screen.getByLabelText('Locale');
    expect(select.querySelectorAll('optgroup').length).toBeGreaterThan(0);
  });
});
