/**
 * SnapshotFallback tests — S4.9.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SnapshotFallback } from './SnapshotFallback';

describe('SnapshotFallback', () => {
  it('renders children without a badge when not stale', () => {
    render(
      <SnapshotFallback isStale={false}>
        <div data-testid="child">chart</div>
      </SnapshotFallback>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.queryByTestId('snapshot-fallback-badge')).not.toBeInTheDocument();
  });

  it('renders a plain "Stale" badge when no lastFreshAtMs is provided', () => {
    render(
      <SnapshotFallback isStale={true}>
        <div data-testid="child">chart</div>
      </SnapshotFallback>,
    );
    const wrapper = screen.getByTestId('snapshot-fallback');
    expect(wrapper).toHaveAttribute('data-stale', 'true');
    const badge = screen.getByTestId('snapshot-fallback-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent(/^Stale$/);
  });

  it('renders "Stale (last fresh HH:MM:SS)" badge when lastFreshAtMs is provided', () => {
    const lastFreshAtMs = Date.UTC(2026, 0, 1, 12, 30, 45);
    render(
      <SnapshotFallback isStale={true} lastFreshAtMs={lastFreshAtMs}>
        <div data-testid="child">chart</div>
      </SnapshotFallback>,
    );
    const badge = screen.getByTestId('snapshot-fallback-badge');
    expect(badge).toHaveTextContent(/Stale \(last fresh /);
    // The actual time string depends on the locale, but it should contain digits.
    expect(badge.textContent).toMatch(/\d/);
  });

  it('respects a custom dataTestId', () => {
    render(
      <SnapshotFallback isStale={true} dataTestId="my-snapshot">
        <div data-testid="child">chart</div>
      </SnapshotFallback>,
    );
    expect(screen.getByTestId('my-snapshot')).toBeInTheDocument();
    expect(screen.getByTestId('my-snapshot-badge')).toBeInTheDocument();
  });
});
