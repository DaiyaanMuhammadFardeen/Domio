/**
 * SemanticSearch — Wave 6 §S6.10 unit tests.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SemanticSearch } from './SemanticSearch';
import { LocaleProvider } from '../../lib/locale';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function renderSearch(overrides?: { onJump?: ReturnType<typeof vi.fn> }) {
  const onJump = overrides?.onJump ?? vi.fn();
  return {
    onJump,
    ...render(
      <LocaleProvider locale="en">
        <SemanticSearch onJump={onJump} />
      </LocaleProvider>,
    ),
  };
}

describe('SemanticSearch', () => {
  it('renders the search bar', () => {
    renderSearch();
    expect(screen.getByTestId('p6-semantic-search')).toBeInTheDocument();
    expect(screen.getByTestId('p6-semantic-search-input')).toBeInTheDocument();
  });

  it('debounces input and shows results after 300ms', async () => {
    const onJump = vi.fn();
    renderSearch({ onJump });
    const input = screen.getByTestId('p6-semantic-search-input');
    fireEvent.change(input, { target: { value: 'pricing' } });

    // Just under the 300ms debounce — no results yet.
    await new Promise<void>((resolve) => setTimeout(resolve, 250));
    expect(screen.queryByTestId('p6-semantic-search-results')).toBeNull();

    // Past the debounce window — wait for the async fetch to complete.
    await waitFor(
      () => {
        expect(screen.getByTestId('p6-semantic-search-results')).toBeInTheDocument();
      },
      { timeout: 1000 },
    );
    expect(screen.getByTestId('p6-search-result-0')).toBeInTheDocument();
  });

  it('renders an empty state when no results match', async () => {
    // Empty query yields no results immediately, so debounce skips.
    renderSearch();
    fireEvent.change(screen.getByTestId('p6-semantic-search-input'), { target: { value: '   ' } });
    await waitFor(() => {
      expect(screen.queryByTestId('p6-semantic-search-results')).toBeNull();
    });
  });

  it('calls onJump when clicking a result', async () => {
    const onJump = vi.fn();
    renderSearch({ onJump });
    fireEvent.change(screen.getByTestId('p6-semantic-search-input'), { target: { value: 'pricing' } });

    await waitFor(
      () => {
        expect(screen.getByTestId('p6-search-result-0')).toBeInTheDocument();
      },
      { timeout: 2000 },
    );

    fireEvent.click(screen.getByTestId('p6-search-result-0-jump'));
    expect(onJump).toHaveBeenCalledWith(expect.objectContaining({ slideId: expect.any(String) }));
  });

  it('renders results from a real fetch response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        query: 'pricing',
        total: 2,
        results: [
          {
            slideId: 's1',
            deckId: 'd1',
            deckTitle: 'Pricing deck',
            slideTitle: 'Pricing tiers',
            snippet: 'How much each tier costs.',
            score: 0.9,
          },
          {
            slideId: 's2',
            deckId: 'd1',
            deckTitle: 'Pricing deck',
            slideTitle: 'FAQ',
            snippet: 'Common pricing questions.',
            score: 0.7,
          },
        ],
      }),
    }) as unknown as typeof fetch;

    renderSearch();
    fireEvent.change(screen.getByTestId('p6-semantic-search-input'), { target: { value: 'pricing' } });

    await waitFor(() => {
      expect(screen.getByTestId('p6-search-result-1')).toBeInTheDocument();
    });
    expect(screen.getByTestId('p6-search-result-0-score').textContent).toContain('90%');
  });
});