/**
 * PhoneRemote tests — S4.2.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PhoneRemote } from './PhoneRemote';
import type { PairingInfo } from '../../runtime/types';

const PAIRING: PairingInfo = {
  token: 'token-xyz',
  deep_link: 'https://domio.app/pair/token-xyz',
  epoch: 1,
  expires_at_ms: Date.now() + 60_000,
  paired_devices: 0,
};

describe('PhoneRemote', () => {
  beforeEach(() => {
    // Default: 404 (no devices endpoint yet) so the component stays in
    // a stable empty-state for assertions.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not found', { status: 404 })),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the QR placeholder and a "0 connected" counter', () => {
    render(<PhoneRemote pairing={PAIRING} />);
    expect(screen.getByTestId('phone-remote-qr')).toBeInTheDocument();
    expect(screen.getByTestId('phone-remote-count').textContent).toContain('0 connected');
  });

  it('renders the deep link inside the QR tile', () => {
    render(<PhoneRemote pairing={PAIRING} />);
    const qr = screen.getByTestId('phone-remote-qr');
    expect(qr.textContent).toContain('domio.app/pair/token-xyz');
  });

  it('shows a device list when the API returns devices', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              devices: [
                {
                  device_id: 'd1',
                  display_name: 'iPhone 15',
                  connected_at_ms: Date.now(),
                  supports_haptics: true,
                },
              ],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      ),
    );
    render(<PhoneRemote pairing={PAIRING} />);
    // Wait for the fetch + setState to settle.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByTestId('phone-remote-count').textContent).toContain('1 connected');
    expect(screen.getByTestId('phone-remote-device-d1')).toBeInTheDocument();
  });

  it('renders a laser pointer toggle', () => {
    render(<PhoneRemote pairing={PAIRING} />);
    const checkbox = screen.getByTestId('phone-remote-laser') as HTMLInputElement;
    expect(checkbox).toBeInTheDocument();
    expect(checkbox.checked).toBe(false);
  });
});
