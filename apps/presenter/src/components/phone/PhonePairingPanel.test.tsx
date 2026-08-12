/**
 * PhonePairingPanel tests — S4.2.
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PhonePairingPanel } from './PhonePairingPanel';
import type { PairingInfo } from '../../runtime/types';

const PAIRING: PairingInfo = {
  token: 'abc123token',
  deep_link: 'https://domio.app/pair/abc123token',
  epoch: 3,
  expires_at_ms: Date.now() + 60_000,
  paired_devices: 2,
};

function expandPanel() {
  // Click the header — its onClick toggles the expanded state.
  const panel = screen.getByTestId('phone-pairing-panel');
  const header = panel.querySelector('header')!;
  fireEvent.click(header);
}

describe('PhonePairingPanel', () => {
  it('renders the collapsed header by default', () => {
    render(<PhonePairingPanel pairing={PAIRING} />);
    expect(screen.getByText(/Pairing details/i)).toBeInTheDocument();
    // The deep link input is hidden until expanded.
    expect(screen.queryByTestId('phone-pairing-panel-link')).toBeNull();
  });

  it('expands to show the deep link and token when clicked', () => {
    render(<PhonePairingPanel pairing={PAIRING} />);
    expandPanel();
    expect(screen.getByTestId('phone-pairing-panel-link')).toHaveValue(PAIRING.deep_link);
    expect(screen.getByText('abc123token')).toBeInTheDocument();
  });

  it('shows a rotate button only when onRotate is provided', () => {
    render(<PhonePairingPanel pairing={PAIRING} onRotate={async () => PAIRING} />);
    expandPanel();
    expect(screen.getByTestId('phone-pairing-panel-rotate')).toBeInTheDocument();
  });

  it('hides the rotate button when onRotate is not provided', () => {
    render(<PhonePairingPanel pairing={PAIRING} />);
    expandPanel();
    expect(screen.queryByTestId('phone-pairing-panel-rotate')).toBeNull();
  });

  it('calls onRotate when the rotate button is clicked', async () => {
    const spy = vi.fn(async () => PAIRING);
    render(<PhonePairingPanel pairing={PAIRING} onRotate={spy} />);
    expandPanel();
    await fireEvent.click(screen.getByTestId('phone-pairing-panel-rotate'));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('copies the deep link to clipboard', async () => {
    const spy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    render(<PhonePairingPanel pairing={PAIRING} />);
    expandPanel();
    await fireEvent.click(screen.getByTestId('phone-pairing-panel-copy'));
    expect(spy).toHaveBeenCalledWith(PAIRING.deep_link);
    spy.mockRestore();
  });
});