/**
 * ChartRecommender — Wave 6 §S6.10 unit tests.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChartRecommender } from './ChartRecommender';
import { LocaleProvider } from '../../lib/locale';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function renderRecommender(overrides?: {
  onApply?: ReturnType<typeof vi.fn>;
  dataPreview?: {
    columns: ReadonlyArray<string>;
    rows: ReadonlyArray<ReadonlyArray<string | number>>;
  };
  currentChartType?: 'bar' | 'line' | 'pie' | 'scatter' | 'area' | 'table';
}) {
  const onApply = overrides?.onApply ?? vi.fn();
  return {
    onApply,
    ...render(
      <LocaleProvider locale="en">
        <ChartRecommender
          dataElementId="data-1"
          {...(overrides?.dataPreview ? { dataPreview: overrides.dataPreview } : {})}
          {...(overrides?.currentChartType ? { currentChartType: overrides.currentChartType } : {})}
          onApply={onApply}
        />
      </LocaleProvider>,
    ),
  };
}

describe('ChartRecommender', () => {
  it('renders the panel + suggest button', () => {
    renderRecommender();
    expect(screen.getByTestId('p6-chart-recommender')).toBeInTheDocument();
    expect(screen.getByTestId('p6-chart-suggest-btn')).toBeInTheDocument();
  });

  it('renders 3 options after clicking Suggest (offline fallback)', async () => {
    renderRecommender({
      dataPreview: {
        columns: ['region', 'price'],
        rows: [
          ['us', 10],
          ['eu', 20],
        ],
      },
    });
    fireEvent.click(screen.getByTestId('p6-chart-suggest-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('p6-chart-results')).toBeInTheDocument();
    });

    expect(screen.getByTestId('p6-chart-option-0')).toBeInTheDocument();
    expect(screen.getByTestId('p6-chart-option-1')).toBeInTheDocument();
    expect(screen.getByTestId('p6-chart-option-2')).toBeInTheDocument();
  });

  it('renders 3 options from a real fetch response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        dataElementId: 'data-1',
        recommendations: [
          { chartType: 'line', confidence: 0.9, rationale: 'Trend data.' },
          { chartType: 'bar', confidence: 0.7, rationale: 'Compare groups.' },
          { chartType: 'area', confidence: 0.5, rationale: 'Magnitude.' },
        ],
      }),
    }) as unknown as typeof fetch;

    renderRecommender();
    fireEvent.click(screen.getByTestId('p6-chart-suggest-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('p6-chart-option-2')).toBeInTheDocument();
    });
    expect(screen.getByTestId('p6-chart-option-0-rationale').textContent).toContain('Trend');
  });

  it('calls onApply when clicking Apply', async () => {
    const onApply = vi.fn();
    renderRecommender({ onApply });
    fireEvent.click(screen.getByTestId('p6-chart-suggest-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('p6-chart-option-0')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('p6-chart-option-0-apply'));
    expect(onApply).toHaveBeenCalledWith(expect.any(String));
  });

  it('disables Apply for the currently-selected chart type', async () => {
    const onApply = vi.fn();
    renderRecommender({
      onApply,
      currentChartType: 'bar',
      dataPreview: {
        columns: ['region', 'price'],
        rows: [['us', 10]],
      },
    });
    fireEvent.click(screen.getByTestId('p6-chart-suggest-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('p6-chart-option-0')).toBeInTheDocument();
    });

    const applyBtn = screen.getByTestId('p6-chart-option-0-apply') as HTMLButtonElement;
    expect(applyBtn.disabled).toBe(true);
  });
});
