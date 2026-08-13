import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { CohortMatrix } from './CohortMatrix';
import type { CohortMatrix as CohortMatrixShape } from '../lib/cohort-service';

const SAMPLE_MATRIX: CohortMatrixShape = {
  weeks: 4,
  rows: [
    {
      joinWeek: '2025-W14',
      size: 240,
      retention: [1.0, 0.62, 0.41, 0.28],
    },
    {
      joinWeek: '2025-W15',
      size: 180,
      retention: [1.0, 0.55, 0.37, 0],
    },
    {
      joinWeek: '2025-W16',
      size: 305,
      retention: [1.0, 0.71, 0.48, 0.33],
    },
  ],
};

describe('CohortMatrix', () => {
  it('renders a row per cohort and a column per week', () => {
    render(<CohortMatrix matrix={SAMPLE_MATRIX} />);
    expect(screen.getByTestId('cohort-matrix')).toBeInTheDocument();
    expect(screen.getByText('2025-W14')).toBeInTheDocument();
    expect(screen.getByText('2025-W15')).toBeInTheDocument();
    expect(screen.getByText('2025-W16')).toBeInTheDocument();
    // One header per week (W1..W4).
    expect(screen.getByText('W1')).toBeInTheDocument();
    expect(screen.getByText('W4')).toBeInTheDocument();
  });

  it('renders W1 cell with 100% for the first cohort', () => {
    render(<CohortMatrix matrix={SAMPLE_MATRIX} />);
    const cell = document.querySelector(
      '[data-cohort="2025-W14"][data-week="1"]',
    );
    expect(cell).not.toBeNull();
    expect(cell?.getAttribute('data-value')).toBe('1');
    expect(cell?.textContent).toBe('100%');
  });

  it('renders fallback for cells where retention data is missing', () => {
    render(<CohortMatrix matrix={SAMPLE_MATRIX} />);
    // W4 of W15 has a 0 value (data trimmed in this cohort).
    const cell = document.querySelector(
      '[data-cohort="2025-W15"][data-week="4"]',
    );
    expect(cell?.getAttribute('data-value')).toBe('0');
    expect(cell?.textContent).toBe('0%');
  });

  it('renders cohort size column', () => {
    render(<CohortMatrix matrix={SAMPLE_MATRIX} />);
    const matrix = screen.getByTestId('cohort-matrix');
    // Three sizes (240, 180, 305) all rendered as text inside <td>s.
    expect(within(matrix as HTMLElement).getByText('240')).toBeInTheDocument();
    expect(within(matrix as HTMLElement).getByText('180')).toBeInTheDocument();
    expect(within(matrix as HTMLElement).getByText('305')).toBeInTheDocument();
  });

  it('renders empty state when there are no rows', () => {
    render(<CohortMatrix matrix={{ rows: [], weeks: 4 }} />);
    expect(screen.getByTestId('cohort-empty')).toBeInTheDocument();
  });
});