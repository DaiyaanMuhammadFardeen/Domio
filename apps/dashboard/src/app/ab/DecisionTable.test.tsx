import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DecisionTable } from './DecisionTable';
import { toneForStatus } from '../../components/Badge';

const ROWS = [
  {
    experimentId: 'exp-001',
    experimentName: 'Hero CTA',
    status: 'significant' as const,
    variants: 'a / b',
    sampleSizes: '100 / 100',
    conversionRates: '4% / 5%',
    liftPct: 0.25,
    pValue: 0.01,
    ciLow: 0.05,
    ciHigh: 0.45,
  },
  {
    experimentId: 'exp-002',
    experimentName: 'Footer',
    status: 'underpowered' as const,
    variants: 'a / b',
    sampleSizes: '50 / 50',
    conversionRates: '2% / 3%',
    liftPct: 0.5,
    pValue: 0.4,
    ciLow: -0.1,
    ciHigh: 1.1,
  },
];

describe('DecisionTable', () => {
  it('renders all columns', () => {
    render(<DecisionTable rows={ROWS} />);
    expect(screen.getByText('Hero CTA')).toBeInTheDocument();
    expect(screen.getByText('Footer')).toBeInTheDocument();
    // 'significant' / 'underpowered' appear in the legend; use
    // getAllByText and assert at least one match for each.
    expect(screen.getAllByText(/significant/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/underpowered/).length).toBeGreaterThan(0);
  });

  it('applies the correct tone for each status', () => {
    expect(toneForStatus('significant')).toBe('green');
    expect(toneForStatus('underpowered')).toBe('yellow');
    expect(toneForStatus('inconclusive')).toBe('amber');
    expect(toneForStatus('running')).toBe('brand');
    expect(toneForStatus('archived')).toBe('grey');
  });

  it('renders empty state when no rows', () => {
    render(<DecisionTable rows={[]} />);
    expect(screen.getByText('No experiments')).toBeInTheDocument();
  });
});
