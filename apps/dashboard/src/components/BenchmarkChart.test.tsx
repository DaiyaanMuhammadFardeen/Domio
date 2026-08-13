import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { BenchmarkChart } from './BenchmarkChart';
import type { PeerBenchmark } from '../lib/benchmark-service';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

const SEED: PeerBenchmark[] = [
  {
    segment: 'SaaS · NA',
    workspaceValue: 0.62,
    peerP25: 0.32,
    peerMedian: 0.48,
    peerP75: 0.61,
    peerSampleSize: 12_400,
    percentile: 92,
    suggestion: 'Top decile — your deck outperforms peers.',
  },
  {
    segment: 'Education · APAC',
    workspaceValue: 0.42,
    peerP25: 0.34,
    peerMedian: 0.51,
    peerP75: 0.7,
    peerSampleSize: 3_400,
    percentile: 38,
    suggestion: 'Below median. Investigate drop-off slides.',
  },
];

describe('BenchmarkChart', () => {
  it('renders one bar per seeded peer row', () => {
    render(<BenchmarkChart workspaceId="ws-demo" initial={SEED} />);
    const bars = screen.getAllByTestId('benchmark-bar');
    expect(bars).toHaveLength(2);
    expect(screen.getByText('SaaS · NA')).toBeInTheDocument();
    expect(screen.getByText('Education · APAC')).toBeInTheDocument();
  });

  it('surfaces the actionable suggestion per row', () => {
    render(<BenchmarkChart workspaceId="ws-demo" initial={SEED} />);
    const suggestions = screen.getAllByTestId('benchmark-suggestion');
    expect(suggestions[0]).toHaveTextContent(/Top decile/);
    expect(suggestions[1]).toHaveTextContent(/Below median/);
  });

  it('renders an empty state when there are no peer rows', () => {
    render(<BenchmarkChart workspaceId="ws-demo" initial={[]} />);
    expect(screen.getByTestId('benchmark-empty')).toBeInTheDocument();
  });

  it('fetches peer rows when no initial list is provided', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ rows: SEED }),
    })) as unknown as typeof fetch;
    globalThis.fetch = mockFetch;
    process.env['NEXT_PUBLIC_WORKSPACE_ID'] = 'ws-demo';

    render(<BenchmarkChart workspaceId="ws-demo" />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const calledArgs = (mockFetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0];
    expect(calledArgs?.[0]).toContain('/v1/analytics/benchmarks/peers');
    const headers = (calledArgs?.[1]?.headers ?? {}) as Record<string, string>;
    expect(headers['x-workspace-id']).toBe('ws-demo');
    expect(screen.getAllByTestId('benchmark-bar')).toHaveLength(2);
  });
});
