/**
 * DeckLintPanel — tests.
 *
 * Per Wave 6 §S6.13: render, lint, click fix, verify flow.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DeckLintPanel } from './DeckLintPanel';
import { LocaleProvider } from '../../lib/locale';

function renderPanel(props: Partial<Parameters<typeof DeckLintPanel>[0]> = {}) {
  return render(
    <LocaleProvider locale="en">
      <DeckLintPanel {...props} />
    </LocaleProvider>,
  );
}

describe('DeckLintPanel', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders the panel header and Lint button', () => {
    renderPanel();
    expect(screen.getByTestId('deck-lint-root')).toBeInTheDocument();
    expect(screen.getByText('Deck Lint')).toBeInTheDocument();
    expect(screen.getByTestId('deck-lint-scan-btn')).toBeInTheDocument();
  });

  it('Lint calls /v1/lint/deck and lists violations', async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/lint/deck')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            violations: [
              {
                id: 'v-1',
                kind: 'broken-data-binding',
                slideId: 's1',
                elementId: 'c1',
                message: 'Dataset sheet-99 not found',
                severity: 'high',
              },
            ],
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
    fireEvent.click(screen.getByTestId('deck-lint-scan-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('deck-lint-violation-v-1')).toBeInTheDocument();
    });
    expect(screen.getByTestId('deck-lint-violation-v-1')).toHaveTextContent('Broken data binding');
    expect(screen.getByTestId('deck-lint-violation-v-1')).toHaveTextContent('Dataset sheet-99 not found');
    expect(screen.getByTestId('deck-lint-severity-v-1')).toHaveTextContent('high');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/lint/deck'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('clicking Fix calls /v1/lint/deck/fix and renders a patch preview', async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/lint/deck')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            violations: [
              {
                id: 'v-2',
                kind: 'off-brand-color',
                slideId: 's2',
                elementId: 'r1',
                message: 'Color #ff00aa is not in the brand kit',
                severity: 'medium',
              },
            ],
          }),
        } as Response;
      }
      if (url.endsWith('/v1/lint/deck/fix')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            violationId: 'v-2',
            patch: [{ op: 'set-color', elementId: 'r1', token: 'brand.primary' }],
            before: 'fill = #ff00aa',
            after: 'fill = var(--brand-primary)',
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
    fireEvent.click(screen.getByTestId('deck-lint-scan-btn'));

    await waitFor(() => screen.getByTestId('deck-lint-fix-v-2'));
    fireEvent.click(screen.getByTestId('deck-lint-fix-v-2'));

    await waitFor(() => {
      expect(screen.getByTestId('deck-lint-patch')).toBeInTheDocument();
    });
    expect(screen.getByTestId('deck-lint-patch-before')).toHaveTextContent('#ff00aa');
    expect(screen.getByTestId('deck-lint-patch-after')).toHaveTextContent('var(--brand-primary)');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/lint/deck/fix'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('Accept removes the violation and invokes onAccept with the patch', async () => {
    const onAccept = vi.fn();
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/lint/deck')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            violations: [
              {
                id: 'v-3',
                kind: 'orphaned-component',
                slideId: 's1',
                elementId: 'sp1',
                message: 'Component has no parent',
                severity: 'low',
              },
            ],
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          violationId: 'v-3',
          patch: [{ op: 'remove-element', elementId: 'sp1' }],
          before: 'shape present',
          after: 'shape removed',
        }),
      } as Response;
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    renderPanel({ onAccept });
    fireEvent.click(screen.getByTestId('deck-lint-scan-btn'));

    await waitFor(() => screen.getByTestId('deck-lint-fix-v-3'));
    fireEvent.click(screen.getByTestId('deck-lint-fix-v-3'));

    await waitFor(() => screen.getByTestId('deck-lint-accept-btn'));
    fireEvent.click(screen.getByTestId('deck-lint-accept-btn'));

    expect(onAccept).toHaveBeenCalledWith('v-3', [{ op: 'remove-element', elementId: 'sp1' }]);
    expect(screen.queryByTestId('deck-lint-violation-v-3')).not.toBeInTheDocument();
  });

  it('Reject closes the patch preview without removing the violation', async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/lint/deck')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            violations: [
              {
                id: 'v-4',
                kind: 'missing-source',
                slideId: 's1',
                elementId: 't1',
                message: 'Statistic has no source citation',
                severity: 'medium',
              },
            ],
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          violationId: 'v-4',
          patch: [{ op: 'set-aria', elementId: 't1', ariaLabel: 'Source: Q4 report' }],
          before: 'no source',
          after: 'source linked',
        }),
      } as Response;
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    renderPanel();
    fireEvent.click(screen.getByTestId('deck-lint-scan-btn'));
    await waitFor(() => screen.getByTestId('deck-lint-fix-v-4'));
    fireEvent.click(screen.getByTestId('deck-lint-fix-v-4'));

    await waitFor(() => screen.getByTestId('deck-lint-reject-btn'));
    fireEvent.click(screen.getByTestId('deck-lint-reject-btn'));

    expect(screen.queryByTestId('deck-lint-patch')).not.toBeInTheDocument();
    expect(screen.getByTestId('deck-lint-violation-v-4')).toBeInTheDocument();
  });

  it('shows empty state when no violations found', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ violations: [] }),
    })) as unknown as typeof fetch;
    globalThis.fetch = mockFetch;

    renderPanel();
    fireEvent.click(screen.getByTestId('deck-lint-scan-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('deck-lint-empty')).toBeInTheDocument();
    });
  });
});