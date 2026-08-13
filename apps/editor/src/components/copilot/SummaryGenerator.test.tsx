/**
 * SummaryGenerator tests — Wave 6 §S6.8.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SummaryGenerator } from './SummaryGenerator';
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

describe('SummaryGenerator', () => {
  it('renders the empty state with a Generate button', () => {
    render(<SummaryGenerator deck={DECK} />);
    expect(screen.getByTestId('summary-generator')).toBeInTheDocument();
    expect(screen.getByTestId('summary-generator-generate')).toBeInTheDocument();
    expect(screen.getByTestId('summary-generator-empty')).toBeInTheDocument();
  });

  it('renders TL;DR and summary slide after a remote response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tldr: 'TL;DR — bullet one, bullet two',
        summary_slide: {
          after_slide_id: 's2',
          title: 'Executive summary',
          body: 'TL;DR — bullet one, bullet two',
          bullets: ['Bullet one', 'Bullet two'],
        },
        offline: false,
      }),
    }) as unknown as typeof fetch;
    render(<SummaryGenerator deck={DECK} />);
    fireEvent.click(screen.getByTestId('summary-generator-generate'));
    await waitFor(() => {
      expect(screen.getByTestId('summary-generator-tldr')).toBeInTheDocument();
    });
    expect(screen.getByTestId('summary-generator-tldr').textContent).toContain('TL;DR');
    expect(screen.getByTestId('summary-generator-slide-title').textContent).toBe('Executive summary');
    expect(screen.getByTestId('summary-generator-slide-body').textContent).toContain('bullet one');
  });

  it('emits onInsert when the Insert slide button is clicked', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const onInsert = vi.fn();
    render(<SummaryGenerator deck={DECK} onInsert={onInsert} />);
    fireEvent.click(screen.getByTestId('summary-generator-generate'));
    await waitFor(() => {
      expect(screen.getByTestId('summary-generator-insert')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('summary-generator-insert'));
    expect(onInsert).toHaveBeenCalledTimes(1);
    const call = onInsert.mock.calls[0];
    const slide = call?.[0];
    const tldr = call?.[1];
    expect(slide?.title).toBe('Executive summary');
    expect(typeof tldr).toBe('string');
    expect((tldr ?? '').length).toBeGreaterThan(0);
  });

  it('falls back to heuristic summary when fetch fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    render(<SummaryGenerator deck={DECK} />);
    fireEvent.click(screen.getByTestId('summary-generator-generate'));
    await waitFor(() => {
      expect(screen.getByTestId('summary-generator-offline')).toBeInTheDocument();
    });
    expect(screen.getByTestId('summary-generator-tldr').textContent).toContain('TL;DR');
  });
});