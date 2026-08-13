/**
 * VirtualBackgroundSelector tests — S4.6.
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  VirtualBackgroundSelector,
  type VirtualBackgroundOption,
} from './VirtualBackgroundSelector';

const OPTIONS: VirtualBackgroundOption[] = [
  { id: 'none', label: 'No background', mode: 'none' },
  { id: 'blur', label: 'Blur', mode: 'blur' },
  { id: 'office', label: 'Office', mode: 'image', imageUrl: 'https://example.com/office.jpg' },
];

describe('VirtualBackgroundSelector', () => {
  it('renders one button per option', () => {
    render(<VirtualBackgroundSelector options={OPTIONS} activeId="none" onChange={vi.fn()} />);
    expect(screen.getByTestId('virtual-background-selector-option-none')).toBeInTheDocument();
    expect(screen.getByTestId('virtual-background-selector-option-blur')).toBeInTheDocument();
    expect(screen.getByTestId('virtual-background-selector-option-office')).toBeInTheDocument();
  });

  it('marks the active option as checked', () => {
    render(<VirtualBackgroundSelector options={OPTIONS} activeId="blur" onChange={vi.fn()} />);
    expect(
      screen.getByTestId('virtual-background-selector-option-blur').getAttribute('aria-checked'),
    ).toBe('true');
    expect(
      screen.getByTestId('virtual-background-selector-option-none').getAttribute('aria-checked'),
    ).toBe('false');
  });

  it('emits onChange when an option is clicked', () => {
    const onChange = vi.fn();
    render(<VirtualBackgroundSelector options={OPTIONS} activeId="none" onChange={onChange} />);
    fireEvent.click(screen.getByTestId('virtual-background-selector-option-blur'));
    expect(onChange).toHaveBeenCalledWith('blur');
  });

  it('disables all options when disabled', () => {
    render(
      <VirtualBackgroundSelector options={OPTIONS} activeId="none" disabled onChange={vi.fn()} />,
    );
    expect(
      (screen.getByTestId('virtual-background-selector-option-blur') as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
