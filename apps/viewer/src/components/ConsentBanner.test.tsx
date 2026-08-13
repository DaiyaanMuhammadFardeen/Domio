import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { ConsentBanner } from './ConsentBanner';

beforeEach(() => {
  cleanup();
  if (typeof localStorage !== 'undefined') localStorage.clear();
});

describe('ConsentBanner', () => {
  it('renders the consent banner', () => {
    render(<ConsentBanner onChange={vi.fn()} />);
    expect(screen.getAllByTestId('consent-banner').length).toBeGreaterThan(0);
  });

  it('renders all three consent tiers', () => {
    render(<ConsentBanner onChange={vi.fn()} />);
    expect(screen.getAllByTestId('consent-option-opt_in').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('consent-option-opt_out').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('consent-option-anonymous').length).toBeGreaterThan(0);
  });

  it('reports the active tier in the summary', () => {
    render(<ConsentBanner onChange={vi.fn()} defaultTier="anonymous" />);
    expect(screen.getAllByTestId('consent-summary')[0]!.textContent).toContain(
      'Anonymous analytics only',
    );
  });

  it('confirms the selected tier via onChange', () => {
    const onChange = vi.fn();
    render(<ConsentBanner onChange={onChange} defaultTier="opt_out" />);
    fireEvent.click(screen.getAllByTestId('consent-radio-opt_in')[0]!);
    fireEvent.click(screen.getAllByTestId('consent-confirm')[0]!);
    expect(onChange).toHaveBeenLastCalledWith('opt_in');
  });

  it('dismisses without changing the tier', () => {
    const onChange = vi.fn();
    const onDismiss = vi.fn();
    render(<ConsentBanner onChange={onChange} onDismiss={onDismiss} defaultTier="opt_out" />);
    fireEvent.click(screen.getAllByTestId('consent-dismiss')[0]!);
    expect(onDismiss).toHaveBeenCalledWith('opt_out');
    expect(screen.queryAllByTestId('consent-banner')).toHaveLength(0);
  });

  it('reads the stored tier on mount and skips the banner', async () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('domio.viewer.consent', 'anonymous');
    }
    const onChange = vi.fn();
    render(<ConsentBanner onChange={onChange} />);
    // useEffect reads localStorage after mount (React 19 schedules it in
    // a microtask). Wait for the banner to disappear.
    await waitFor(
      () => {
        expect(screen.queryAllByTestId('consent-banner')).toHaveLength(0);
      },
      { timeout: 2000 },
    );
    expect(onChange).toHaveBeenCalledWith('anonymous');
  });
});
