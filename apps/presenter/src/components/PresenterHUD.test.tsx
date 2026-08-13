/**
 * PresenterHUD tests — S4.1.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PresenterHUD } from './PresenterHUD';
import type { SlideSnapshot, PairingInfo } from '../runtime/types';

const NOW = Date.now();
const TEN_MIN_AGO = new Date(NOW - 10 * 60_000).toISOString();
const JUST_NOW = new Date(NOW).toISOString();

const SLIDE: SlideSnapshot = {
  slide_id: 's1',
  slide_index: 0,
  title: 'Intro',
  thumbnail_url: undefined,
  notes: undefined,
};

const PAIRING: PairingInfo = {
  token: 'abc123',
  deep_link: 'https://domio.app/pair/abc123',
  epoch: 1,
  expires_at_ms: NOW + 60_000,
  paired_devices: 0,
};

const STATE = {
  slide_index: 0,
  slide_id: 's1',
  presenter_id: 'p1',
  started_at: TEN_MIN_AGO,
  ended_at: null,
  mode: 'live' as const,
  last_heartbeat_at: JUST_NOW,
  plan: { hidden: [], order: [] },
  agenda_timers: [{ id: 'agenda1', label: 'Main', duration_ms: 60 * 60_000 }],
};

describe('PresenterHUD', () => {
  it('renders the current and next slide labels', () => {
    render(
      <PresenterHUD
        sessionId="sess1"
        state={STATE}
        activeSlide={SLIDE}
        nextSlide={null}
        totalSlides={5}
        pairing={PAIRING}
        whisperCount={0}
        audienceParticipationCount={0}
      />,
    );
    expect(screen.getByTestId('presenter-hud-now').textContent).toContain('Intro');
    expect(screen.getByTestId('presenter-hud-now').textContent).toContain('1/5');
    expect(screen.getByTestId('presenter-hud-next').textContent).toBe('End');
  });

  it('shows the agenda percent', () => {
    render(
      <PresenterHUD
        sessionId="sess1"
        state={STATE}
        activeSlide={SLIDE}
        nextSlide={null}
        totalSlides={5}
        pairing={PAIRING}
        whisperCount={0}
        audienceParticipationCount={0}
      />,
    );
    const txt = screen.getByTestId('presenter-hud-agenda-pct').textContent ?? '';
    expect(txt).toMatch(/% of \d+ min/);
  });

  it('flags a stale heartbeat', () => {
    const STALE_STATE = {
      ...STATE,
      last_heartbeat_at: new Date(NOW - 5 * 60_000).toISOString(),
    };
    render(
      <PresenterHUD
        sessionId="sess1"
        state={STALE_STATE}
        activeSlide={SLIDE}
        nextSlide={null}
        totalSlides={5}
        pairing={PAIRING}
        whisperCount={0}
        audienceParticipationCount={0}
      />,
    );
    expect(screen.getByTestId('presenter-hud-heartbeat').textContent).toContain('stale');
  });

  it('renders the mode pill', () => {
    render(
      <PresenterHUD
        sessionId="sess1"
        state={STATE}
        activeSlide={SLIDE}
        nextSlide={null}
        totalSlides={5}
        pairing={PAIRING}
        whisperCount={0}
        audienceParticipationCount={0}
      />,
    );
    expect(screen.getByTestId('presenter-hud-mode').textContent).toBe('live');
  });

  it('shows the whisper count', () => {
    render(
      <PresenterHUD
        sessionId="sess1"
        state={STATE}
        activeSlide={SLIDE}
        nextSlide={null}
        totalSlides={5}
        pairing={PAIRING}
        whisperCount={3}
        audienceParticipationCount={0}
      />,
    );
    expect(screen.getByTestId('presenter-hud-whispers').textContent).toContain('3');
  });

  it('copies the pairing URL when the button is clicked', () => {
    const spy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    render(
      <PresenterHUD
        sessionId="sess1"
        state={STATE}
        activeSlide={SLIDE}
        nextSlide={null}
        totalSlides={5}
        pairing={PAIRING}
        whisperCount={0}
        audienceParticipationCount={0}
      />,
    );
    screen.getByTestId('presenter-hud-copy-pair').click();
    expect(spy).toHaveBeenCalled();
  });
});
