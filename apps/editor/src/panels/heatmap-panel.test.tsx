import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HeatmapPanel, type HeatmapBucketView } from './heatmap-panel';

const BUCKET: HeatmapBucketView = {
  width: 4,
  height: 4,
  cells: [
    { x: 0.125, y: 0.125, clicks: 12, dwellMs: 3000, slideDrops: 2 },
    { x: 0.625, y: 0.625, clicks: 3, dwellMs: 1000, slideDrops: 0 },
    { x: 0.375, y: 0.375, clicks: 0, dwellMs: 200, slideDrops: 1 },
  ],
};

function defaultProps(
  overrides: Partial<React.ComponentProps<typeof HeatmapPanel>> = {},
): React.ComponentProps<typeof HeatmapPanel> {
  return {
    bucket: BUCKET,
    onReset: vi.fn(),
    onRegenerate: vi.fn(),
    onDownloadCSV: vi.fn(),
    ...overrides,
  } as React.ComponentProps<typeof HeatmapPanel>;
}

describe('HeatmapPanel', () => {
  it('renders the panel header', () => {
    render(<HeatmapPanel {...defaultProps()} />);
    expect(screen.getByRole('heading', { name: 'Click heatmap' })).toBeInTheDocument();
  });

  it('renders one cell per aggregated coordinate', () => {
    render(<HeatmapPanel {...defaultProps()} />);
    expect(screen.getAllByTestId('m5-heatmap-cell')).toHaveLength(3);
  });

  it('reports the cell count, max clicks, and total slide drops', () => {
    render(<HeatmapPanel {...defaultProps()} />);
    expect(screen.getByTestId('m5-heatmap-cell-count').textContent).toContain('3 cells');
    expect(screen.getByTestId('m5-heatmap-max-clicks').textContent).toContain('12');
    expect(screen.getByTestId('m5-heatmap-slide-drops').textContent).toContain('3');
  });

  it('forwards clicks on each action button', () => {
    const onReset = vi.fn();
    const onRegenerate = vi.fn();
    const onDownloadCSV = vi.fn();
    render(
      <HeatmapPanel
        {...defaultProps({
          onReset,
          onRegenerate,
          onDownloadCSV,
        })}
      />,
    );
    fireEvent.click(screen.getByTestId('m5-heatmap-reset'));
    fireEvent.click(screen.getByTestId('m5-heatmap-regenerate'));
    fireEvent.click(screen.getByTestId('m5-heatmap-csv'));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onRegenerate).toHaveBeenCalledTimes(1);
    expect(onDownloadCSV).toHaveBeenCalledTimes(1);
  });

  it('handles a null bucket gracefully', () => {
    render(<HeatmapPanel {...defaultProps({ bucket: null })} />);
    expect(screen.getByTestId('m5-heatmap-cell-count').textContent).toContain('0 cells');
    expect(screen.queryAllByTestId('m5-heatmap-cell')).toHaveLength(0);
  });
});
