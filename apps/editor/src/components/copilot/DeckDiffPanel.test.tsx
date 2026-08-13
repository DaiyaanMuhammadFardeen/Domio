/**
 * DeckDiffPanel — tests.
 *
 * Per Wave 6 §S6.13: render with two versions, verify the per-element
 * diff highlight is rendered with the correct classification.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DeckDiffPanel } from './DeckDiffPanel';
import { LocaleProvider } from '../../lib/locale';

function renderPanel(props: Partial<Parameters<typeof DeckDiffPanel>[0]> = {}) {
  return render(
    <LocaleProvider locale="en">
      <DeckDiffPanel {...props} />
    </LocaleProvider>,
  );
}

const SAMPLE_ENTRIES = [
  {
    id: 'slide-3',
    kind: 'slide',
    slideIndex: 2,
    path: null,
    before: null,
    after: { title: 'New slide' },
    diff: 'added',
  },
  {
    id: 'slide-1',
    kind: 'slide',
    slideIndex: 0,
    path: null,
    before: { title: 'Old opening' },
    after: null,
    diff: 'removed',
  },
  {
    id: 't-1',
    kind: 'text',
    slideIndex: 1,
    path: 'content.text',
    before: 'Old copy',
    after: 'New copy',
    diff: 'changed',
  },
];

describe('DeckDiffPanel', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders two inputs and a Compare button', () => {
    renderPanel();
    expect(screen.getByTestId('deck-diff-root')).toBeInTheDocument();
    expect(screen.getByTestId('deck-diff-input-a')).toBeInTheDocument();
    expect(screen.getByTestId('deck-diff-input-b')).toBeInTheDocument();
    expect(screen.getByTestId('deck-diff-compare-btn')).toBeInTheDocument();
  });

  it('disables Compare when one input is empty', () => {
    renderPanel();
    fireEvent.change(screen.getByTestId('deck-diff-input-a'), { target: { value: 'a' } });
    expect(screen.getByTestId('deck-diff-compare-btn')).toBeDisabled();
  });

  it('Compare calls /v1/diff/deck with both deck IDs', async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/diff/deck')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            deckIdA: 'a',
            deckIdB: 'b',
            entries: SAMPLE_ENTRIES,
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({}),
      } as Response;
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    renderPanel();
    fireEvent.change(screen.getByTestId('deck-diff-input-a'), { target: { value: 'a' } });
    fireEvent.change(screen.getByTestId('deck-diff-input-b'), { target: { value: 'b' } });
    fireEvent.click(screen.getByTestId('deck-diff-compare-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('deck-diff-entry-slide-3')).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/diff/deck'),
      expect.objectContaining({ method: 'POST' }),
    );

    const [, init] = (mockFetch as unknown as {
      mock: { calls: Array<[string, RequestInit]> };
    }).mock.calls[0]!;
    expect(JSON.parse(String(init.body))).toEqual({
      deckIdA: 'a',
      deckIdB: 'b',
    });
  });

  it('renders diff entries with the correct classification + highlight', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        deckIdA: 'a',
        deckIdB: 'b',
        entries: SAMPLE_ENTRIES,
      }),
    })) as unknown as typeof fetch;
    globalThis.fetch = mockFetch;

    renderPanel();
    fireEvent.change(screen.getByTestId('deck-diff-input-a'), { target: { value: 'a' } });
    fireEvent.change(screen.getByTestId('deck-diff-input-b'), { target: { value: 'b' } });
    fireEvent.click(screen.getByTestId('deck-diff-compare-btn'));

    await waitFor(() => screen.getByTestId('deck-diff-entry-slide-3'));

    // Classification labels
    expect(screen.getByTestId('deck-diff-entry-classification-slide-3')).toHaveTextContent('Added');
    expect(screen.getByTestId('deck-diff-entry-classification-slide-1')).toHaveTextContent('Removed');
    expect(screen.getByTestId('deck-diff-entry-classification-t-1')).toHaveTextContent('Changed');

    // Diff kind exposed on the element (used by test hooks + a11y).
    expect(screen.getByTestId('deck-diff-entry-slide-3')).toHaveAttribute('data-diff', 'added');
    expect(screen.getByTestId('deck-diff-entry-slide-1')).toHaveAttribute('data-diff', 'removed');
    expect(screen.getByTestId('deck-diff-entry-t-1')).toHaveAttribute('data-diff', 'changed');

    // Field path shown.
    expect(screen.getByTestId('deck-diff-entry-path-t-1')).toHaveTextContent('content.text');

    // Before / After snippets.
    expect(screen.getByTestId('deck-diff-entry-before-t-1')).toHaveTextContent('Old copy');
    expect(screen.getByTestId('deck-diff-entry-after-t-1')).toHaveTextContent('New copy');
  });

  it('shows the summary pill counts', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        deckIdA: 'a',
        deckIdB: 'b',
        entries: SAMPLE_ENTRIES,
      }),
    })) as unknown as typeof fetch;
    globalThis.fetch = mockFetch;

    renderPanel();
    fireEvent.change(screen.getByTestId('deck-diff-input-a'), { target: { value: 'a' } });
    fireEvent.change(screen.getByTestId('deck-diff-input-b'), { target: { value: 'b' } });
    fireEvent.click(screen.getByTestId('deck-diff-compare-btn'));

    await waitFor(() => screen.getByTestId('deck-diff-summary'));
    expect(screen.getByTestId('deck-diff-summary')).toHaveTextContent('+1 added');
    expect(screen.getByTestId('deck-diff-summary')).toHaveTextContent('-1 removed');
    expect(screen.getByTestId('deck-diff-summary')).toHaveTextContent('~1 changed');
  });

  it('shows empty state when there are no differences', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ deckIdA: 'a', deckIdB: 'b', entries: [] }),
    })) as unknown as typeof fetch;
    globalThis.fetch = mockFetch;

    renderPanel();
    fireEvent.change(screen.getByTestId('deck-diff-input-a'), { target: { value: 'a' } });
    fireEvent.change(screen.getByTestId('deck-diff-input-b'), { target: { value: 'b' } });
    fireEvent.click(screen.getByTestId('deck-diff-compare-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('deck-diff-empty')).toBeInTheDocument();
    });
  });

  it('invokes onComplete with the entries', async () => {
    const onComplete = vi.fn();
    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        deckIdA: 'a',
        deckIdB: 'b',
        entries: SAMPLE_ENTRIES,
      }),
    })) as unknown as typeof fetch;
    globalThis.fetch = mockFetch;

    renderPanel({ onComplete });
    fireEvent.change(screen.getByTestId('deck-diff-input-a'), { target: { value: 'a' } });
    fireEvent.change(screen.getByTestId('deck-diff-input-b'), { target: { value: 'b' } });
    fireEvent.click(screen.getByTestId('deck-diff-compare-btn'));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith(SAMPLE_ENTRIES);
    });
  });

  it('shows an error message when the diff endpoint fails', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({}),
    })) as unknown as typeof fetch;
    globalThis.fetch = mockFetch;

    renderPanel();
    fireEvent.change(screen.getByTestId('deck-diff-input-a'), { target: { value: 'a' } });
    fireEvent.change(screen.getByTestId('deck-diff-input-b'), { target: { value: 'b' } });
    fireEvent.click(screen.getByTestId('deck-diff-compare-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('deck-diff-error')).toBeInTheDocument();
    });
  });
});