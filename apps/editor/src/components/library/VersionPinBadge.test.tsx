/**
 * VersionPinBadge — Wave 2 §S2.6 unit tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VersionPinBadge } from './VersionPinBadge';

describe('VersionPinBadge', () => {
  it('renders a tracking badge for pinMode track', () => {
    render(<VersionPinBadge pinMode="track" installedVersion="1.0.0" />);
    expect(screen.getByTestId('version-pin-badge-tracking')).toBeInTheDocument();
    expect(screen.getByText(/Tracking v1.0.0/)).toBeInTheDocument();
  });

  it('renders a pinned badge for pin-version', () => {
    render(
      <VersionPinBadge pinMode="pin-version" installedVersion="1.2.3" pinValue="1.2.3" />,
    );
    expect(screen.getByTestId('version-pin-badge-pinned')).toBeInTheDocument();
    expect(screen.getByText(/Pinned to v1.2.3/)).toBeInTheDocument();
  });

  it('renders a range badge for pin-range', () => {
    render(
      <VersionPinBadge pinMode="pin-range" installedVersion="1.0.0" pinValue="^1.0.0" />,
    );
    expect(screen.getByTestId('version-pin-badge-ranged')).toBeInTheDocument();
    expect(screen.getByText(/Range \^1.0.0/)).toBeInTheDocument();
  });

  it('renders an update badge when latestVersion differs', () => {
    render(
      <VersionPinBadge pinMode="track" installedVersion="1.0.0" latestVersion="2.0.0" onUpdate={vi.fn()} />,
    );
    expect(screen.getByTestId('version-pin-badge-update')).toBeInTheDocument();
    expect(screen.getByText(/Update available: v2.0.0/)).toBeInTheDocument();
  });

  it('emits onUpdate when the Update button is clicked', () => {
    const onUpdate = vi.fn();
    render(
      <VersionPinBadge pinMode="track" installedVersion="1.0.0" latestVersion="2.0.0" onUpdate={onUpdate} />,
    );
    fireEvent.click(screen.getByTestId('version-pin-badge-update-1.0.0'));
    expect(onUpdate).toHaveBeenCalled();
  });

  it('hides the Update button in read-only mode', () => {
    render(
      <VersionPinBadge pinMode="track" installedVersion="1.0.0" latestVersion="2.0.0" onUpdate={vi.fn()} readOnly />,
    );
    expect(screen.queryByTestId('version-pin-badge-update-1.0.0')).toBeNull();
  });
});
