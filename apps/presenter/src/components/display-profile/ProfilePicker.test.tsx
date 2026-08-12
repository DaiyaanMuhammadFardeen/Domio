/**
 * ProfilePicker tests — S4.10.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProfilePicker } from './ProfilePicker';

describe('ProfilePicker', () => {
  beforeEach(() => {
    // Make sure no prior test left a snapshot in storage.
    window.localStorage.clear();
  });

  it('renders with the section title and a no-profile summary by default', () => {
    render(<ProfilePicker actorId="actor-1" />);
    expect(screen.getByText(/Display profile/i)).toBeInTheDocument();
    expect(screen.getByTestId('profile-picker-summary')).toHaveTextContent(/No profile selected/);
  });

  it('picks the ultrawide preset on click', async () => {
    const onChange = vi.fn();
    render(<ProfilePicker actorId="actor-1" onChange={onChange} />);
    fireEvent.click(screen.getByTestId('profile-picker-ultrawide'));
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });
    const snap = onChange.mock.calls[0]![0];
    expect(snap.name).toBe('ultrawide-21x9');
    expect(snap.width).toBe(3440);
    expect(snap.height).toBe(1440);
    expect(snap.color_profile).toBe('display_p3');
    expect(screen.getByTestId('profile-picker-summary')).toHaveTextContent(/3440×1440@100Hz/);
  });

  it('picks the auto-detected profile from window.screen', async () => {
    const onChange = vi.fn();
    // jsdom default screen is 1024×768 — but we can override.
    Object.defineProperty(window, 'screen', {
      value: { width: 2560, height: 1440 },
      configurable: true,
    });
    render(<ProfilePicker actorId="actor-2" onChange={onChange} />);
    await waitFor(() => {
      expect(screen.getByTestId('profile-picker-auto')).not.toBeDisabled();
    });
    fireEvent.click(screen.getByTestId('profile-picker-auto'));
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });
    const snap = onChange.mock.calls[0]![0];
    expect(snap.width).toBe(2560);
    expect(snap.height).toBe(1440);
  });

  it('applies the LED-wall custom profile with HDR', async () => {
    const onChange = vi.fn();
    render(<ProfilePicker actorId="actor-3" onChange={onChange} />);

    fireEvent.change(screen.getByTestId('profile-picker-color'), { target: { value: 'rec2020' } });
    const hdr = screen.getByTestId('profile-picker-hdr') as HTMLInputElement;
    if (!hdr.checked) fireEvent.click(hdr);

    fireEvent.click(screen.getByTestId('profile-picker-led-wall-apply'));
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });
    const snap = onChange.mock.calls[0]![0];
    expect(snap.color_profile).toBe('rec2020');
    expect(snap.hdr).toBe(true);
    expect(snap.name).toMatch(/led-wall-3840x2160/);
  });

  it('persists the chosen snapshot to localStorage', async () => {
    render(<ProfilePicker actorId="actor-4" />);
    fireEvent.click(screen.getByTestId('profile-picker-ultrawide'));
    await waitFor(() => {
      const raw = window.localStorage.getItem('domio:profile-picker:v1:actor-4');
      expect(raw).not.toBeNull();
      const snap = JSON.parse(raw!);
      expect(snap.name).toBe('ultrawide-21x9');
    });
  });

  it('rehydrates a stored snapshot on mount', async () => {
    window.localStorage.setItem(
      'domio:profile-picker:v1:actor-5',
      JSON.stringify({
        name: '4K-stage',
        width: 3840,
        height: 2160,
        refresh_hz: 60,
        color_profile: 'rec2020',
        hdr: true,
        bandwidth_estimate_mbps: 220,
        mirror_mode: 'extend',
      }),
    );
    render(<ProfilePicker actorId="actor-5" />);
    await waitFor(() => {
      expect(screen.getByTestId('profile-picker-summary')).toHaveTextContent(/3840×2160/);
    });
  });
});
