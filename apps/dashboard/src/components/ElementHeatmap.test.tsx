/**
 * ElementHeatmap — tests.
 *
 * Verifies the slide preview renders each element as a clickable
 * overlay tile and that clicking an element swaps in the drill-in
 * time-series chart. The time-series fetch is mocked so the test
 * never hits the network.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ElementHeatmap } from './ElementHeatmap';
import type { ElementHeatmap as ElementHeatmapShape } from '../lib/element-heatmap-service';

const originalFetch = globalThis.fetch;

const SAMPLE_DATA: ElementHeatmapShape = {
  deckId: 'deck-1',
  slideId: 'slide-1',
  slideWidth: 960,
  slideHeight: 540,
  elements: [
    {
      id: 'el-chart',
      label: 'Revenue chart',
      kind: 'chart',
      x: 0.05,
      y: 0.1,
      width: 0.55,
      height: 0.6,
      attention: 0.82,
      attentionMs: 12_345,
    },
    {
      id: 'el-cta',
      label: 'Buy now',
      kind: 'button',
      x: 0.66,
      y: 0.55,
      width: 0.28,
      height: 0.2,
      attention: 0.45,
      attentionMs: 6_789,
    },
    {
      id: 'el-body',
      label: 'Body copy',
      kind: 'text',
      x: 0.05,
      y: 0.78,
      width: 0.9,
      height: 0.18,
      attention: 0.6,
      attentionMs: 8_900,
    },
  ],
};

function mockTimeseriesResponse() {
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      points: [
        { t: '2025-08-01T00:00:00Z', attention: 0.2 },
        { t: '2025-08-02T00:00:00Z', attention: 0.4 },
        { t: '2025-08-03T00:00:00Z', attention: 0.55 },
        { t: '2025-08-04T00:00:00Z', attention: 0.7 },
      ],
    }),
  })) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('ElementHeatmap', () => {
  it('renders one button per element with the correct kind', () => {
    render(<ElementHeatmap workspaceId="ws-demo" data={SAMPLE_DATA} />);
    const elements = screen.getAllByTestId('slide-element');
    expect(elements).toHaveLength(3);
    expect(elements[0]?.getAttribute('data-element-kind')).toBe('chart');
    expect(elements[1]?.getAttribute('data-element-kind')).toBe('button');
    expect(elements[2]?.getAttribute('data-element-kind')).toBe('text');
    // Labels render inside the overlay buttons.
    expect(screen.getByText('Revenue chart')).toBeInTheDocument();
    expect(screen.getByText('Buy now')).toBeInTheDocument();
  });

  it('renders the empty state when there are no elements', () => {
    render(
      <ElementHeatmap
        workspaceId="ws-demo"
        data={{ ...SAMPLE_DATA, elements: [] }}
      />,
    );
    expect(screen.queryAllByTestId('slide-element')).toHaveLength(0);
    expect(
      screen.getByText(/No element attention data/i),
    ).toBeInTheDocument();
  });

  it('renders the drill-in placeholder before any element is clicked', () => {
    render(<ElementHeatmap workspaceId="ws-demo" data={SAMPLE_DATA} />);
    expect(screen.getByTestId('drill-in-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('drill-in')).toBeNull();
  });

  it('clicking an element fetches its time-series and renders the drill-in chart', async () => {
    mockTimeseriesResponse();
    render(<ElementHeatmap workspaceId="ws-demo" data={SAMPLE_DATA} />);

    const elements = screen.getAllByTestId('slide-element');
    const chartEl = elements.find((el) => el.getAttribute('data-element-id') === 'el-chart');
    expect(chartEl).toBeDefined();
    fireEvent.click(chartEl as HTMLElement);

    // The drill-in panel mounts with the clicked elementId and
    // fires its own fetch to the time-series endpoint.
    await waitFor(() => {
      expect(screen.getByTestId('drill-in')).toBeInTheDocument();
    });
    const drill = screen.getByTestId('drill-in');
    expect(drill.getAttribute('data-element-id')).toBe('el-chart');
    // 4 sample points → eventually a chart svg renders.
    await waitFor(() => {
      expect(screen.getByTestId('drill-in-chart')).toBeInTheDocument();
    });
  });
});