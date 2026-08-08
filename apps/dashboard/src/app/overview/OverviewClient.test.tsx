import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OverviewClient } from './OverviewClient';

const SAMPLE = {
  sessions: { value: 1234, delta: 5.0, series: [1, 2, 3, 4, 5, 6, 7] },
  viewers: { value: 5678, delta: -2.1, series: [10, 9, 8, 7, 6, 5, 4] },
  avgDwellMs: {
    value: 24000,
    delta: 0,
    series: [20, 21, 22, 23, 24, 25, 26],
  },
  completionRate: {
    value: 0.72,
    delta: 1.5,
    series: [0.6, 0.65, 0.7, 0.72, 0.74, 0.75, 0.78],
  },
};

describe('OverviewClient', () => {
  it('renders 4 KPI tiles with formatted values', () => {
    render(<OverviewClient kpis={SAMPLE} />);
    expect(screen.getByText('Sessions')).toBeInTheDocument();
    expect(screen.getByText('Viewers')).toBeInTheDocument();
    expect(screen.getByText('Avg dwell')).toBeInTheDocument();
    expect(screen.getByText('Completion')).toBeInTheDocument();
    expect(screen.getByText('1.2k')).toBeInTheDocument();
    expect(screen.getByText('5.7k')).toBeInTheDocument();
    expect(screen.getByText('24.0 s')).toBeInTheDocument();
    expect(screen.getByText('72.0%')).toBeInTheDocument();
  });

  it('renders 4 SVG sparklines', () => {
    const { container } = render(<OverviewClient kpis={SAMPLE} />);
    // Each KPI tile embeds one <svg> via <Sparkline>.
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThanOrEqual(4);
  });

  it('matches snapshot', () => {
    const { container } = render(<OverviewClient kpis={SAMPLE} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});