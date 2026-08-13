/**
 * PaceTracker tests — Wave 6 §S6.7.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PaceTracker } from './PaceTracker';

describe('PaceTracker', () => {
  it('renders the current WPM value', () => {
    render(<PaceTracker wpm={120} />);
    expect(screen.getByTestId('pace-tracker')).toBeInTheDocument();
    expect(screen.getByTestId('pace-tracker-value').textContent).toBe('120');
  });

  it('flags "Slow" when below target - tolerance', () => {
    render(<PaceTracker wpm={80} targetWpm={150} toleranceWpm={20} />);
    expect(screen.getByTestId('pace-tracker-band').textContent).toBe('Slow');
  });

  it('flags "On target" when within tolerance', () => {
    render(<PaceTracker wpm={155} targetWpm={150} toleranceWpm={20} />);
    expect(screen.getByTestId('pace-tracker-band').textContent).toBe('On target');
  });

  it('flags "Fast" when above target + tolerance', () => {
    render(<PaceTracker wpm={210} targetWpm={150} toleranceWpm={20} />);
    expect(screen.getByTestId('pace-tracker-band').textContent).toBe('Fast');
  });

  it('renders the target marker at the expected percentage', () => {
    render(<PaceTracker wpm={150} targetWpm={150} />);
    const target = screen.getByTestId('pace-tracker-target') as HTMLElement;
    // 150/250 = 60%
    expect(target.style.left).toBe('60%');
  });

  it('handles wpm=0 without throwing', () => {
    render(<PaceTracker wpm={0} />);
    expect(screen.getByTestId('pace-tracker-value').textContent).toBe('0');
  });
});