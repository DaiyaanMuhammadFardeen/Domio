/**
 * EyeContactMeter tests — Wave 6 §S6.7.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EyeContactMeter } from './EyeContactMeter';

describe('EyeContactMeter', () => {
  it('renders the score as a percentage', () => {
    render(<EyeContactMeter score={78} />);
    expect(screen.getByTestId('eye-contact-meter-value').textContent).toBe('78%');
  });

  it('renders Strong band when score >= 70', () => {
    render(<EyeContactMeter score={80} />);
    expect(screen.getByTestId('eye-contact-meter-band').textContent).toBe('Strong');
  });

  it('renders Mixed band when 40 <= score < 70', () => {
    render(<EyeContactMeter score={55} />);
    expect(screen.getByTestId('eye-contact-meter-band').textContent).toBe('Mixed');
  });

  it('renders Low band when score < 40', () => {
    render(<EyeContactMeter score={20} />);
    expect(screen.getByTestId('eye-contact-meter-band').textContent).toBe('Low');
  });

  it('clamps scores above 100', () => {
    render(<EyeContactMeter score={150} />);
    expect(screen.getByTestId('eye-contact-meter-value').textContent).toBe('100%');
  });

  it('clamps negative scores to 0', () => {
    render(<EyeContactMeter score={-10} />);
    expect(screen.getByTestId('eye-contact-meter-value').textContent).toBe('0%');
  });
});
