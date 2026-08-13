/**
 * LocalePicker tests — S5.5.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LocalePicker } from './LocalePicker';
import { LIST_LOCALES } from '@/lib/locale-prefs';

describe('LocalePicker', () => {
  it('renders an option for every supported locale', () => {
    render(<LocalePicker value="en" onChange={() => {}} />);
    const select = screen.getByTestId('locale-picker-select') as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    // Every short code from LIST_LOCALES should appear (either as the
    // bcp47 form for plain codes, or as itself for region tags).
    for (const code of LIST_LOCALES) {
      const bcp47 = code.includes('-') ? code : `${code}-${code.toUpperCase()}`;
      expect(optionValues).toContain(bcp47);
    }
  });

  it('reflects the current value', () => {
    render(<LocalePicker value="fr-FR" onChange={() => {}} />);
    const select = screen.getByTestId('locale-picker-select') as HTMLSelectElement;
    expect(select.value).toBe('fr-FR');
  });

  it('calls onChange when a new locale is selected', () => {
    const onChange = vi.fn();
    render(<LocalePicker value="en-US" onChange={onChange} />);
    const select = screen.getByTestId('locale-picker-select') as HTMLSelectElement;
    select.value = 'fr-FR';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith('fr-FR');
  });
});
