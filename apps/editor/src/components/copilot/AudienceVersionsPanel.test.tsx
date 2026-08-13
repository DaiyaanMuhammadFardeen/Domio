/**
 * AudienceVersionsPanel tests — Wave 6 §S6.8.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AudienceVersionsPanel } from './AudienceVersionsPanel';
import type { DeckContext } from './lib/qa-service';

const DECK: DeckContext = {
  deck_id: 'deck-1',
  title: 'Sample deck',
  slides: [
    { slide_id: 's1', title: 'Intro', body: 'Hello world.' },
    { slide_id: 's2', title: 'Body', body: 'Detail here.' },
  ],
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('AudienceVersionsPanel', () => {
  it('renders three persona options and a default selection', () => {
    render(<AudienceVersionsPanel deck={DECK} />);
    expect(screen.getByTestId('audience-versions-persona-five_min')).toBeInTheDocument();
    expect(screen.getByTestId('audience-versions-persona-technical')).toBeInTheDocument();
    expect(screen.getByTestId('audience-versions-persona-executive')).toBeInTheDocument();
    expect(
      screen.getByTestId('audience-versions-persona-executive').getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('calls the remote versions endpoint and renders the branched deck', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'ver-1',
        persona: 'five_min',
        label: '5-minute lightning',
        slides: [
          { slide_id: 's1-5min', title: 'Intro', body: 'Trimmed' },
          { slide_id: 'closer-5min', title: 'Ask', body: 'Open for questions' },
        ],
        offline: false,
      }),
    }) as unknown as typeof fetch;
    const onVersion = vi.fn();
    render(<AudienceVersionsPanel deck={DECK} onVersion={onVersion} />);
    fireEvent.click(screen.getByTestId('audience-versions-persona-five_min'));
    fireEvent.click(screen.getByTestId('audience-versions-generate'));
    await waitFor(() => {
      expect(screen.getByTestId('audience-versions-result')).toBeInTheDocument();
    });
    expect(screen.getByTestId('audience-versions-id').textContent).toBe('ver-1');
    expect(screen.getByTestId('audience-versions-slide-s1-5min')).toBeInTheDocument();
    expect(onVersion).toHaveBeenCalledTimes(1);
  });

  it('falls back to local branching when fetch fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    render(<AudienceVersionsPanel deck={DECK} />);
    fireEvent.click(screen.getByTestId('audience-versions-persona-technical'));
    fireEvent.click(screen.getByTestId('audience-versions-generate'));
    await waitFor(() => {
      expect(screen.getByTestId('audience-versions-offline')).toBeInTheDocument();
    });
    // Technical version keeps the original slides but adds notes.
    expect(screen.getByTestId('audience-versions-slide-s1-tech')).toBeInTheDocument();
    expect(screen.getByTestId('audience-versions-slide-s2-tech')).toBeInTheDocument();
  });

  it('switches the active persona when a different chip is clicked', () => {
    render(<AudienceVersionsPanel deck={DECK} />);
    fireEvent.click(screen.getByTestId('audience-versions-persona-technical'));
    expect(
      screen.getByTestId('audience-versions-persona-technical').getAttribute('aria-checked'),
    ).toBe('true');
    expect(
      screen.getByTestId('audience-versions-persona-executive').getAttribute('aria-checked'),
    ).toBe('false');
  });
});
