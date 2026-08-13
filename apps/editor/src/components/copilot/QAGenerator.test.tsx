/**
 * QAGenerator tests — Wave 6 §S6.8.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QAGenerator } from './QAGenerator';
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

describe('QAGenerator', () => {
  it('renders the empty state with a Generate button', () => {
    render(<QAGenerator deck={DECK} />);
    expect(screen.getByTestId('qa-generator')).toBeInTheDocument();
    expect(screen.getByTestId('qa-generator-generate')).toBeInTheDocument();
    expect(screen.getByTestId('qa-generator-empty')).toBeInTheDocument();
  });

  it('calls the remote QA endpoint and renders the pairs', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pairs: [
          { slide_id: 's1', question: 'Why?', answer: 'Because.', confidence: 0.9 },
          { slide_id: 's2', question: 'How?', answer: 'Like this.', confidence: 0.8 },
        ],
        offline: false,
      }),
    }) as unknown as typeof fetch;
    render(<QAGenerator deck={DECK} />);
    fireEvent.click(screen.getByTestId('qa-generator-generate'));
    await waitFor(() => {
      expect(screen.getByTestId('qa-generator-list')).toBeInTheDocument();
    });
    expect(screen.getByTestId('qa-generator-pair-0-question').textContent).toContain('Why?');
    expect(screen.getByTestId('qa-generator-pair-0-answer').textContent).toContain('Because.');
    expect(screen.getByTestId('qa-generator-pair-1-question').textContent).toContain('How?');
  });

  it('falls back to heuristic Q&A when fetch fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    render(<QAGenerator deck={DECK} maxPairs={2} />);
    fireEvent.click(screen.getByTestId('qa-generator-generate'));
    await waitFor(() => {
      expect(screen.getByTestId('qa-generator-offline')).toBeInTheDocument();
    });
    expect(screen.getByTestId('qa-generator-pair-0')).toBeInTheDocument();
    expect(screen.getByTestId('qa-generator-pair-1')).toBeInTheDocument();
  });
});
