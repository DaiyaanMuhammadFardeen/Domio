/**
 * FreshnessChecker — tests.
 *
 * Per Wave 6 §S6.11: render, click Scan, verify chips + update flow.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FreshnessChecker } from './FreshnessChecker';
import { LocaleProvider } from '../../lib/locale';

function renderPanel(props: Partial<Parameters<typeof FreshnessChecker>[0]> = {}) {
  return render(
    <LocaleProvider locale="en">
      <FreshnessChecker {...props} />
    </LocaleProvider>,
  );
}

describe('FreshnessChecker', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders the panel header and Scan button', () => {
    renderPanel();
    expect(screen.getByTestId('freshness-root')).toBeInTheDocument();
    expect(screen.getByText('Freshness')).toBeInTheDocument();
    expect(screen.getByTestId('freshness-scan-btn')).toBeInTheDocument();
  });

  it('Scan calls /v1/ai/check-freshness and renders one chip per claim', async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/ai/check-freshness')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            claims: [
              {
                id: 'cl-1',
                slideId: 's1',
                elementId: 't1',
                text: 'Q4 revenue grew 18%',
                kind: 'stat',
                lastVerifiedAt: '2024-03-15T00:00:00Z',
                freshnessScore: 35,
                sourceRef: null,
              },
              {
                id: 'cl-2',
                slideId: 's2',
                elementId: 't2',
                text: 'Founded in 2018',
                kind: 'date',
                lastVerifiedAt: '2024-03-15T00:00:00Z',
                freshnessScore: 88,
                sourceRef: 'wikipedia:company',
              },
            ],
            scannedAt: '2026-08-13T10:00:00Z',
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
    fireEvent.click(screen.getByTestId('freshness-scan-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('freshness-chip-cl-1')).toBeInTheDocument();
      expect(screen.getByTestId('freshness-chip-cl-2')).toBeInTheDocument();
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/ai/check-freshness'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(screen.getByTestId('freshness-score-cl-1')).toHaveTextContent('35');
    expect(screen.getByTestId('freshness-score-cl-2')).toHaveTextContent('88');
  });

  it('shows empty state when no stale claims are found', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ claims: [], scannedAt: '2026-08-13T10:00:00Z' }),
    })) as unknown as typeof fetch;
    globalThis.fetch = mockFetch;

    renderPanel();
    fireEvent.click(screen.getByTestId('freshness-scan-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('freshness-empty')).toBeInTheDocument();
    });
  });

  it('clicking a chip calls /v1/ai/check-freshness/update and renders a suggestion', async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/ai/check-freshness')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            claims: [
              {
                id: 'cl-3',
                slideId: 's1',
                elementId: 't1',
                text: 'Q4 revenue grew 18%',
                kind: 'stat',
                lastVerifiedAt: '2024-03-15T00:00:00Z',
                freshnessScore: 35,
                sourceRef: null,
              },
            ],
            scannedAt: '2026-08-13T10:00:00Z',
          }),
        } as Response;
      }
      if (url.endsWith('/v1/ai/check-freshness/update')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            claimId: 'cl-3',
            replacement: 'Q4 revenue grew 24%',
            replacementSource: 'finance.reporting/q4-2025',
            rationale: 'Reflects the latest published Q4 2025 figure.',
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
    fireEvent.click(screen.getByTestId('freshness-scan-btn'));

    await waitFor(() => screen.getByTestId('freshness-chip-cl-3'));
    fireEvent.click(screen.getByTestId('freshness-chip-cl-3'));

    await waitFor(() => {
      expect(screen.getByTestId('freshness-update')).toBeInTheDocument();
    });
    expect(screen.getByTestId('freshness-update-replacement')).toHaveTextContent(
      'Q4 revenue grew 24%',
    );
    expect(screen.getByTestId('freshness-update-rationale')).toHaveTextContent('Q4 2025 figure');
    expect(screen.getByTestId('freshness-update-source')).toHaveTextContent(
      'finance.reporting/q4-2025',
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/ai/check-freshness/update'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('Accept removes the chip and invokes onAccept with the replacement', async () => {
    const onAccept = vi.fn();
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/ai/check-freshness')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            claims: [
              {
                id: 'cl-4',
                slideId: 's1',
                elementId: 't1',
                text: 'Old stat',
                kind: 'stat',
                lastVerifiedAt: null,
                freshnessScore: 12,
                sourceRef: null,
              },
            ],
            scannedAt: '2026-08-13T10:00:00Z',
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          claimId: 'cl-4',
          replacement: 'New stat',
          replacementSource: null,
          rationale: '',
        }),
      } as Response;
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    renderPanel({ onAccept });
    fireEvent.click(screen.getByTestId('freshness-scan-btn'));

    await waitFor(() => screen.getByTestId('freshness-chip-cl-4'));
    fireEvent.click(screen.getByTestId('freshness-chip-cl-4'));

    await waitFor(() => screen.getByTestId('freshness-accept-btn'));
    fireEvent.click(screen.getByTestId('freshness-accept-btn'));

    expect(onAccept).toHaveBeenCalledWith('cl-4', 'New stat');
    expect(screen.queryByTestId('freshness-chip-cl-4')).not.toBeInTheDocument();
  });

  it('Reject closes the update preview without removing the chip', async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/ai/check-freshness')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            claims: [
              {
                id: 'cl-5',
                slideId: 's1',
                elementId: 't1',
                text: 'Stale date',
                kind: 'date',
                lastVerifiedAt: '2023-01-01T00:00:00Z',
                freshnessScore: 20,
                sourceRef: null,
              },
            ],
            scannedAt: '2026-08-13T10:00:00Z',
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          claimId: 'cl-5',
          replacement: '2025-01-01',
          replacementSource: 'press-release',
          rationale: 'Latest press release date.',
        }),
      } as Response;
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    renderPanel();
    fireEvent.click(screen.getByTestId('freshness-scan-btn'));
    await waitFor(() => screen.getByTestId('freshness-chip-cl-5'));
    fireEvent.click(screen.getByTestId('freshness-chip-cl-5'));

    await waitFor(() => screen.getByTestId('freshness-reject-btn'));
    fireEvent.click(screen.getByTestId('freshness-reject-btn'));

    expect(screen.queryByTestId('freshness-update')).not.toBeInTheDocument();
    expect(screen.getByTestId('freshness-chip-cl-5')).toBeInTheDocument();
  });
});
