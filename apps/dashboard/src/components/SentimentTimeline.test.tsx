import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { SentimentTimeline } from './SentimentTimeline';
import type { SentimentSeries } from '../lib/sentiment-service';

const SAMPLE_SERIES: ReadonlyArray<SentimentSeries> = [
  {
    slideId: 'slide-1',
    points: [
      { date: '2025-08-01', score: 0.2, responses: 18 },
      { date: '2025-08-02', score: 0.45, responses: 21 },
      { date: '2025-08-03', score: 0.55, responses: 17 },
      { date: '2025-08-04', score: 0.7, responses: 24 },
    ],
  },
  {
    slideId: 'slide-2',
    points: [
      { date: '2025-08-01', score: -0.1, responses: 12 },
      { date: '2025-08-02', score: 0.0, responses: 14 },
      { date: '2025-08-03', score: 0.25, responses: 16 },
      { date: '2025-08-04', score: 0.4, responses: 18 },
    ],
  },
];

describe('SentimentTimeline', () => {
  it('renders one svg plus a legend', () => {
    render(<SentimentTimeline series={SAMPLE_SERIES} />);
    expect(screen.getByTestId('sentiment-chart')).toBeInTheDocument();
    const legend = screen.getByTestId('sentiment-legend');
    expect(within(legend as HTMLElement).getByText('slide-1')).toBeInTheDocument();
    expect(within(legend as HTMLElement).getByText('slide-2')).toBeInTheDocument();
  });

  it('renders a <g> per series, each tagged with slide id', () => {
    render(<SentimentTimeline series={SAMPLE_SERIES} />);
    const groups = screen.getAllByTestId('sentiment-series');
    expect(groups).toHaveLength(2);
    expect(groups[0]?.getAttribute('data-slide-id')).toBe('slide-1');
    expect(groups[1]?.getAttribute('data-slide-id')).toBe('slide-2');
  });

  it('renders the empty state when there are no series', () => {
    render(<SentimentTimeline series={[]} />);
    expect(screen.getByTestId('sentiment-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('sentiment-chart')).toBeNull();
  });

  it('aligns mismatched dates by drawing through missing buckets at zero', () => {
    // Series `a` is missing 2025-08-02; the renderer should still
    // emit a coordinate for that bucket (synthetic score=0) so the
    // polyline stays on a single continuous path across the union
    // date axis (2025-08-01, 2025-08-02, 2025-08-03).
    const base: ReadonlyArray<SentimentSeries> = [
      {
        slideId: 'a',
        points: [
          { date: '2025-08-01', score: 0.1, responses: 5 },
          { date: '2025-08-03', score: 0.5, responses: 6 },
        ],
      },
      {
        slideId: 'b',
        points: [
          { date: '2025-08-02', score: -0.2, responses: 3 },
        ],
      },
    ];
    render(<SentimentTimeline series={base} />);
    const groups = screen.getAllByTestId('sentiment-series');
    expect(groups).toHaveLength(2);
    const groupA = groups.find((g) => g.getAttribute('data-slide-id') === 'a');
    expect(groupA).toBeDefined();
    const path = groupA?.querySelector('path');
    expect(path).not.toBeNull();
    // Series `a` should now have 3 vertices on its polyline.
    expect(path?.getAttribute('d')).toMatch(
      /^M [\d.]+ [\d.]+ L [\d.]+ [\d.]+ L [\d.]+ [\d.]+$/,
    );
  });
});