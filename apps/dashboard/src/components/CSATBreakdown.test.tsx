import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CSATBreakdown } from './CSATBreakdown';
import { rollup } from '../lib/sentiment-service';
import type { CsatBreakdown as CsatBreakdownShape, CsatRow } from '../lib/sentiment-service';

const SAMPLE_ROWS: ReadonlyArray<CsatRow> = [
  { slideId: 'slide-1', score: 10, answer: 'promoter' },
  { slideId: 'slide-1', score: 9, answer: 'promoter' },
  { slideId: 'slide-1', score: 7, answer: 'passive' },
  { slideId: 'slide-1', score: 3, answer: 'detractor' },
  { slideId: 'slide-2', score: 8, answer: 'passive' },
  { slideId: 'slide-2', score: 9, answer: 'promoter' },
  { slideId: 'slide-2', score: 1, answer: 'detractor' },
];

const SAMPLE_DATA: CsatBreakdownShape = rollup(SAMPLE_ROWS);

describe('CSATBreakdown', () => {
  it('renders the headline CSAT %, NPS, and distribution bars', () => {
    render(<CSATBreakdown data={SAMPLE_DATA} />);
    expect(screen.getByTestId('csat-breakdown')).toBeInTheDocument();
    expect(screen.getByTestId('csat-pct').textContent).toMatch(/%$/);
    expect(screen.getByTestId('csat-nps').textContent).toMatch(/^-?\d+$/);
    expect(screen.getByTestId('csat-bar-promoter')).toBeInTheDocument();
    expect(screen.getByTestId('csat-bar-passive')).toBeInTheDocument();
    expect(screen.getByTestId('csat-bar-detractor')).toBeInTheDocument();
  });

  it('renders one row per slide in the per-slide list', () => {
    render(<CSATBreakdown data={SAMPLE_DATA} />);
    const rows = screen.getAllByTestId('csat-per-slide-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.getAttribute('data-slide-id')).toBe('slide-1');
    expect(rows[1]?.getAttribute('data-slide-id')).toBe('slide-2');
  });

  it('shows the empty state when there are no responses', () => {
    render(<CSATBreakdown data={rollup([])} />);
    expect(screen.getByTestId('csat-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('csat-breakdown')).toBeNull();
  });

  it('reports the correct distribution for the fixture', () => {
    // 3 promoter, 2 passive, 2 detractor, total 7.
    // CSAT = (3+2)/7 = 71%, NPS = round(3/7*100 - 2/7*100) = round(14.28) = 14.
    expect(SAMPLE_DATA.total).toBe(7);
    expect(SAMPLE_DATA.promoter).toBe(3);
    expect(SAMPLE_DATA.passive).toBe(2);
    expect(SAMPLE_DATA.detractor).toBe(2);
    expect(SAMPLE_DATA.csatPct).toBe(71);
    expect(SAMPLE_DATA.nps).toBe(14);
  });
});
