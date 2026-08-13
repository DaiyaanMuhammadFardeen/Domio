/**
 * KPIBuilder — tests.
 *
 * Verifies that picking a metric + aggregation and clicking Save
 * hits the typed SDK client with the expected payload, surfaces
 * the new tile, and renders an error banner if the warehouse
 * returns non-2xx.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { KPIBuilder } from './KPIBuilder';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('KPIBuilder', () => {
  it('renders the empty state when no tiles exist', () => {
    render(<KPIBuilder workspaceId="ws-demo" initial={[]} baseUrl="http://wh.test" />);
    expect(screen.getByTestId('kpi-empty')).toBeInTheDocument();
  });

  it('picks a metric, saves, and POSTs the payload', async () => {
    const mockFetch = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({
        kpi: {
          id: 'kpi-1',
          title: 'Hero banner CTR',
          metric: 'completion_rate',
          aggregation: 'avg',
          value: 0.62,
        },
      }),
    })) as unknown as typeof fetch;
    globalThis.fetch = mockFetch;

    render(<KPIBuilder workspaceId="ws-demo" initial={[]} baseUrl="http://wh.test" />);

    fireEvent.change(screen.getByTestId('kpi-title'), {
      target: { value: 'Hero banner CTR' },
    });
    fireEvent.change(screen.getByTestId('kpi-metric'), {
      target: { value: 'completion_rate' },
    });
    fireEvent.change(screen.getByTestId('kpi-aggregation'), {
      target: { value: 'avg' },
    });
    fireEvent.click(screen.getByTestId('kpi-save'));

    // Flush microtasks so the await on saveKpi + setState completes.
    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    const [calledUrl, calledInit] = (
      mockFetch as unknown as { mock: { calls: [string, RequestInit][] } }
    ).mock.calls[0] as unknown as [string, RequestInit];

    expect(calledUrl).toContain('/v1/analytics/kpis');
    expect(calledUrl).toContain('workspace_id=ws-demo');
    expect(calledInit.method).toBe('POST');
    expect(calledInit.body).toBe(
      JSON.stringify({
        title: 'Hero banner CTR',
        metric: 'completion_rate',
        aggregation: 'avg',
      }),
    );

    // The new tile should render after the POST resolves.
    await vi.waitFor(() => {
      expect(screen.getByTestId('kpi-tile')).toBeInTheDocument();
    });
    const tiles = screen.getByTestId('kpi-tiles');
    expect(within(tiles as HTMLElement).getByText('Hero banner CTR')).toBeInTheDocument();
    // The empty state should be gone now.
    expect(screen.queryByTestId('kpi-empty')).toBeNull();
  });

  it('surfaces an error banner when the warehouse returns non-2xx', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    render(<KPIBuilder workspaceId="ws-demo" initial={[]} baseUrl="http://wh.test" />);

    fireEvent.change(screen.getByTestId('kpi-title'), {
      target: { value: 'Broken tile' },
    });
    fireEvent.change(screen.getByTestId('kpi-metric'), {
      target: { value: 'sessions' },
    });
    fireEvent.click(screen.getByTestId('kpi-save'));

    await vi.waitFor(() => {
      expect(screen.getByTestId('kpi-error')).toBeInTheDocument();
    });
    // Tile should NOT have been added.
    expect(screen.queryAllByTestId('kpi-tile')).toHaveLength(0);
  });

  it('renders provided initial tiles', () => {
    render(
      <KPIBuilder
        workspaceId="ws-demo"
        baseUrl="http://wh.test"
        initial={[
          {
            id: 'pre-1',
            title: 'Pre-existing',
            metric: 'sessions',
            aggregation: 'sum',
          },
        ]}
      />,
    );
    expect(screen.queryByTestId('kpi-empty')).toBeNull();
    expect(screen.getByText('Pre-existing')).toBeInTheDocument();
  });
});
