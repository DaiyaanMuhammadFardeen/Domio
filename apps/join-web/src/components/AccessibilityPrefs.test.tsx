/**
 * AccessibilityPrefs tests.
 *
 * Per Wave 5 §S5.9 spec:
 *   render → click large font → verify onChange called with fontSize='large'
 *   verify localStorage write
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AccessibilityPrefs, A11Y_PREFS_STORAGE_KEY } from './AccessibilityPrefs';

describe('AccessibilityPrefs', () => {
  it('renders the four controls with defaults', () => {
    render(<AccessibilityPrefs />);
    expect(screen.getByTestId('a11y-prefs')).toBeInTheDocument();
    expect(screen.getByTestId('a11y-fontsize-medium')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('a11y-position-bottom')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('a11y-high-contrast')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('a11y-reduced-motion')).toHaveAttribute('aria-checked', 'false');
  });

  it('clicking large font fires onChange with fontSize="large" and persists', () => {
    const onChange = vi.fn();
    window.localStorage.removeItem(A11Y_PREFS_STORAGE_KEY);
    render(<AccessibilityPrefs onChange={onChange} />);
    fireEvent.click(screen.getByTestId('a11y-fontsize-large'));
    const lastCall = onChange.mock.calls.at(-1)?.[0];
    expect(lastCall).toBeDefined();
    expect(lastCall.fontSize).toBe('large');
    const stored = window.localStorage.getItem(A11Y_PREFS_STORAGE_KEY);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored as string);
    expect(parsed.fontSize).toBe('large');
  });

  it('toggles high contrast and reduced motion', () => {
    const onChange = vi.fn();
    render(<AccessibilityPrefs onChange={onChange} />);
    fireEvent.click(screen.getByTestId('a11y-high-contrast'));
    fireEvent.click(screen.getByTestId('a11y-reduced-motion'));
    const last = onChange.mock.calls.at(-1)?.[0];
    expect(last).toBeDefined();
    expect(last.highContrast).toBe(true);
    expect(last.reducedMotion).toBe(true);
    expect(screen.getByTestId('a11y-high-contrast')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('a11y-reduced-motion')).toHaveAttribute('aria-checked', 'true');
  });

  it('switches position between top and bottom', () => {
    const onChange = vi.fn();
    render(<AccessibilityPrefs onChange={onChange} />);
    fireEvent.click(screen.getByTestId('a11y-position-top'));
    const last = onChange.mock.calls.at(-1)?.[0];
    expect(last.position).toBe('top');
    expect(screen.getByTestId('a11y-position-top')).toHaveAttribute('aria-pressed', 'true');
  });

  it('honors initial controlled value', () => {
    render(
      <AccessibilityPrefs
        initial={{
          fontSize: 'xl',
          position: 'top',
          highContrast: true,
          reducedMotion: true,
        }}
      />,
    );
    expect(screen.getByTestId('a11y-fontsize-xl')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('a11y-position-top')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('a11y-high-contrast')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('a11y-reduced-motion')).toHaveAttribute('aria-checked', 'true');
  });
});