/**
 * SimulationPanel — tests.
 *
 * Per Wave 6 §S6.12: render, pick a persona, click Run, verify the
 * /v1/ai/simulation call + heatmap render.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SimulationPanel } from './SimulationPanel';
import { LocaleProvider } from '../../lib/locale';

function renderPanel(props: Partial<Parameters<typeof SimulationPanel>[0]> = {}) {
  return render(
    <LocaleProvider locale="en">
      <SimulationPanel {...props} />
    </LocaleProvider>,
  );
}

const SAMPLE_RESPONSE = {
  persona: 'analyst',
  deckId: 'demo',
  slides: [
    {
      slideId: 's-1',
      slideIndex: 0,
      engagement: 88,
      comprehension: 92,
      flags: [],
    },
    {
      slideId: 's-2',
      slideIndex: 1,
      engagement: 42,
      comprehension: 60,
      flags: ['Too many stats on one slide', 'Missing source citation'],
    },
    {
      slideId: 's-3',
      slideIndex: 2,
      engagement: 20,
      comprehension: 35,
      flags: ['Headline contradicts body'],
    },
  ],
  overallEngagement: 50,
};

describe('SimulationPanel', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders the panel header and three persona options', () => {
    renderPanel();
    expect(screen.getByTestId('simulation-panel-root')).toBeInTheDocument();
    expect(screen.getByText('Simulation Mode')).toBeInTheDocument();
    expect(screen.getByTestId('simulation-persona-exec')).toBeInTheDocument();
    expect(screen.getByTestId('simulation-persona-analyst')).toBeInTheDocument();
    expect(screen.getByTestId('simulation-persona-skeptic')).toBeInTheDocument();
  });

  it('defaults to the Executive persona', () => {
    renderPanel();
    expect(screen.getByTestId('simulation-persona-exec')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('simulation-persona-analyst')).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('switching personas updates aria-checked', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('simulation-persona-skeptic'));
    expect(screen.getByTestId('simulation-persona-skeptic')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByTestId('simulation-persona-exec')).toHaveAttribute('aria-checked', 'false');
  });

  it('clicking Run calls /v1/ai/simulation with the picked persona', async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/ai/simulation')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => SAMPLE_RESPONSE,
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
    fireEvent.click(screen.getByTestId('simulation-persona-analyst'));
    fireEvent.click(screen.getByTestId('simulation-run-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('simulation-heatmap')).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/ai/simulation'),
      expect.objectContaining({ method: 'POST' }),
    );

    const [, init] = (
      mockFetch as unknown as {
        mock: { calls: Array<[string, RequestInit]> };
      }
    ).mock.calls[0]!;
    expect(JSON.parse(String(init.body))).toMatchObject({
      persona: 'analyst',
      deckId: 'demo',
    });
  });

  it('renders one row per slide with the engagement score', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => SAMPLE_RESPONSE,
    })) as unknown as typeof fetch;
    globalThis.fetch = mockFetch;

    renderPanel();
    fireEvent.click(screen.getByTestId('simulation-run-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('simulation-slide-s-1')).toBeInTheDocument();
    });
    expect(screen.getByTestId('simulation-slide-s-2')).toBeInTheDocument();
    expect(screen.getByTestId('simulation-slide-s-3')).toBeInTheDocument();
    expect(screen.getByTestId('simulation-slide-score-s-1')).toHaveTextContent('88%');
    expect(screen.getByTestId('simulation-slide-score-s-2')).toHaveTextContent('42%');
    expect(screen.getByTestId('simulation-slide-score-s-3')).toHaveTextContent('20%');
  });

  it('shows the overall engagement score in the heatmap header', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => SAMPLE_RESPONSE,
    })) as unknown as typeof fetch;
    globalThis.fetch = mockFetch;

    renderPanel();
    fireEvent.click(screen.getByTestId('simulation-run-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('simulation-overall')).toHaveTextContent('50%');
    });
  });

  it('expands slide flags on click', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => SAMPLE_RESPONSE,
    })) as unknown as typeof fetch;
    globalThis.fetch = mockFetch;

    renderPanel();
    fireEvent.click(screen.getByTestId('simulation-run-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('simulation-slide-flags-toggle-s-2')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('simulation-slide-flags-s-2')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('simulation-slide-flags-toggle-s-2'));

    expect(screen.getByTestId('simulation-slide-flags-s-2')).toBeInTheDocument();
    expect(screen.getByTestId('simulation-slide-flag-s-2-0')).toHaveTextContent(
      'Too many stats on one slide',
    );
    expect(screen.getByTestId('simulation-slide-flag-s-2-1')).toHaveTextContent(
      'Missing source citation',
    );
  });

  it('invokes onComplete with the simulation result', async () => {
    const onComplete = vi.fn();
    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => SAMPLE_RESPONSE,
    })) as unknown as typeof fetch;
    globalThis.fetch = mockFetch;

    renderPanel({ onComplete });
    fireEvent.click(screen.getByTestId('simulation-run-btn'));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith(SAMPLE_RESPONSE);
    });
  });

  it('shows an error message when the simulation fails', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: async () => ({}),
    })) as unknown as typeof fetch;
    globalThis.fetch = mockFetch;

    renderPanel();
    fireEvent.click(screen.getByTestId('simulation-run-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('simulation-error')).toBeInTheDocument();
    });
  });
});
