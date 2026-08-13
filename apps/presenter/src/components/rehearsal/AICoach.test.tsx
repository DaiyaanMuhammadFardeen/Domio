/**
 * AICoach tests — Wave 6 §S6.7.
 *
 * Renders the coach panel, verifies that the live metrics are visible,
 * and simulates a transcript by mutating internal state via the public
 * PaceTracker/FillerWordCounter subcomponents. The mock fetch keeps
 * the submission path exercisable in jsdom.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AICoach } from './AICoach';

const SLIDES = [
  { slide_id: 's1', title: 'Intro', target_ms: 60_000 },
  { slide_id: 's2', title: 'Body', target_ms: 60_000 },
  { slide_id: 's3', title: 'Close', target_ms: 60_000 },
];

const originalFetch = globalThis.fetch;

beforeEach(() => {
  // jsdom does not implement MediaRecorder / SpeechRecognition; stub
  // the constructors so AICoach's startup path can run without throwing.
  class StubMediaRecorder {
    state: 'inactive' | 'recording' | 'paused' = 'inactive';
    ondataavailable: ((ev: unknown) => void) | null = null;
    onstop: (() => void) | null = null;
    constructor(_stream: MediaStream) { /* noop */ }
    start() { this.state = 'recording'; }
    pause() { this.state = 'paused'; }
    resume() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.onstop?.(); }
  }
  Object.defineProperty(globalThis, 'MediaRecorder', {
    configurable: true,
    writable: true,
    value: StubMediaRecorder,
  });
  if (!('mediaDevices' in navigator)) {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      writable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error('no camera')) },
    });
  } else {
    (navigator.mediaDevices as unknown as { getUserMedia: typeof vi.fn }).getUserMedia =
      vi.fn().mockRejectedValue(new Error('no camera'));
  }
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('AICoach', () => {
  it('renders the header and idle state', () => {
    render(
      <AICoach
        sessionId="sess-1"
        deckId="deck-1"
        slides={SLIDES}
      />,
    );
    expect(screen.getByTestId('ai-coach')).toBeInTheDocument();
    expect(screen.getByText('AI rehearsal coach')).toBeInTheDocument();
    expect(screen.getByTestId('ai-coach-start')).toBeInTheDocument();
  });

  it('shows the live metrics after starting', async () => {
    render(
      <AICoach
        sessionId="sess-1"
        deckId="deck-1"
        slides={SLIDES}
      />,
    );
    fireEvent.click(screen.getByTestId('ai-coach-start'));
    await waitFor(() => {
      expect(screen.getByTestId('pace-tracker')).toBeInTheDocument();
    });
    expect(screen.getByTestId('filler-counter')).toBeInTheDocument();
    expect(screen.getByTestId('eye-contact-meter')).toBeInTheDocument();
  });

  it('marks "Slow" when WPM is below the target window', async () => {
    render(
      <AICoach
        sessionId="sess-1"
        deckId="deck-1"
        slides={SLIDES}
      />,
    );
    fireEvent.click(screen.getByTestId('ai-coach-start'));
    await waitFor(() => {
      expect(screen.getByTestId('pace-tracker')).toBeInTheDocument();
    });
    // The default wpm in the coach is 0 (idle); the band should read "Slow".
    expect(screen.getByTestId('pace-tracker-band').textContent).toBe('Slow');
    expect(screen.getByTestId('pace-tracker-value').textContent).toBe('0');
  });

  it('submits feedback at end-of-session and renders scores', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'fb-1',
        scores: [
          { key: 'pace', score: 82, summary: 'good' },
          { key: 'fillers', score: 65, summary: 'some fillers' },
          { key: 'eye_contact', score: 70, summary: 'ok' },
        ],
        top_fillers: [{ phrase: 'um', count: 4 }],
        stumbled_slides: [{ slide_id: 's2', reason: 'stumble' }],
        pace_heatmap: [{ slide_id: 's1', reason: 'On target' }],
        recommendations: ['Take a breath before answering.'],
        offline: false,
      }),
    }) as unknown as typeof fetch;

    render(
      <AICoach
        sessionId="sess-1"
        deckId="deck-1"
        slides={SLIDES}
      />,
    );
    fireEvent.click(screen.getByTestId('ai-coach-start'));
    await waitFor(() => {
      expect(screen.getByTestId('ai-coach-end')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('ai-coach-end'));

    await waitFor(() => {
      expect(screen.getByTestId('ai-coach-feedback')).toBeInTheDocument();
    });
    expect(screen.getByTestId('ai-coach-score-pace').textContent).toContain('82');
    expect(screen.getByTestId('ai-coach-filler-um').textContent).toContain('um');
    expect(screen.getByTestId('ai-coach-stumble-s2')).toBeInTheDocument();
    expect(screen.getByTestId('ai-coach-heatmap-s1')).toBeInTheDocument();
  });

  it('falls back to offline feedback when the backend is unreachable', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;

    render(
      <AICoach
        sessionId="sess-2"
        deckId="deck-2"
        slides={SLIDES}
      />,
    );
    fireEvent.click(screen.getByTestId('ai-coach-start'));
    await waitFor(() => {
      expect(screen.getByTestId('ai-coach-end')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('ai-coach-end'));

    await waitFor(() => {
      expect(screen.getByTestId('ai-coach-feedback')).toBeInTheDocument();
    });
    // Offline mode shows three score chips (pace, fillers, eye_contact).
    expect(screen.getByTestId('ai-coach-score-pace')).toBeInTheDocument();
    expect(screen.getByTestId('ai-coach-score-fillers')).toBeInTheDocument();
    expect(screen.getByTestId('ai-coach-score-eye_contact')).toBeInTheDocument();
  });
});