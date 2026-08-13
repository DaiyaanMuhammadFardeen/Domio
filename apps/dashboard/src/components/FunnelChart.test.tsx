import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FunnelChart } from './FunnelChart';
import type { FunnelStep } from '../lib/funnel-service';

const STEPS: ReadonlyArray<FunnelStep> = [
  { label: 'Viewers', value: 1000 },
  { label: 'Opened', value: 800 },
  { label: 'Reached slide N', value: 400 },
  { label: 'Converted', value: 120 },
];

describe('FunnelChart', () => {
  it('renders one step per funnel entry', () => {
    render(<FunnelChart steps={STEPS} />);
    expect(screen.getByTestId('funnel-chart')).toBeInTheDocument();
    expect(screen.getByTestId('funnel-chart-step-0')).toBeInTheDocument();
    expect(screen.getByTestId('funnel-chart-step-1')).toBeInTheDocument();
    expect(screen.getByTestId('funnel-chart-step-2')).toBeInTheDocument();
    expect(screen.getByTestId('funnel-chart-step-3')).toBeInTheDocument();
  });

  it('renders the step labels and values', () => {
    render(<FunnelChart steps={STEPS} />);
    expect(screen.getByText('Viewers')).toBeInTheDocument();
    expect(screen.getByText('Opened')).toBeInTheDocument();
    expect(screen.getByText('Converted')).toBeInTheDocument();
    expect(screen.getByText(/1,000/)).toBeInTheDocument();
    expect(screen.getByText(/120/)).toBeInTheDocument();
  });

  it('shows a percentage relative to the head value', () => {
    render(<FunnelChart steps={STEPS} />);
    // The "Converted" step text should include "12.0%" relative to 1000.
    expect(screen.getByText(/12\.0%/)).toBeInTheDocument();
  });

  it('renders the empty state when there are no steps', () => {
    render(<FunnelChart steps={[]} />);
    expect(screen.getByTestId('funnel-chart-empty')).toBeInTheDocument();
  });

  it('honors a custom dropoff label callback', () => {
    render(
      <FunnelChart
        steps={STEPS}
        dropoffLabel={(step, i) => (i === 1 ? `lost ${step.value}` : null)}
      />,
    );
    expect(screen.getByText(/lost 800/)).toBeInTheDocument();
  });
});
