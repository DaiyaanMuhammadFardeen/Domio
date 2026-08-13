/**
 * SessionHeader tests — Wave 5 §S5.1.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SessionHeader } from './SessionHeader';

describe('SessionHeader', () => {
  it('renders the session code, slide title, and "3 / 10" position', () => {
    render(
      <SessionHeader
        sessionCode="ABC123"
        displayName="Alex"
        slideTitle="Wave 5 walkthrough"
        slideIndex={3}
        totalSlides={10}
      />,
    );
    expect(screen.getByTestId('session-header-code').textContent).toBe('ABC123');
    expect(screen.getByTestId('session-header-display-name').textContent).toBe('Alex');
    expect(screen.getByTestId('session-header-slide-title').textContent).toBe(
      'Wave 5 walkthrough',
    );
    expect(screen.getByTestId('session-header-slide-index').textContent).toBe('3 / 10');
  });

  it('renders the slide preview placeholder', () => {
    render(
      <SessionHeader
        sessionCode="XYZ000"
        displayName="Sam"
        slideTitle="Intro"
        slideIndex={1}
        totalSlides={5}
      />,
    );
    expect(screen.getByTestId('session-header-slide-thumb')).toBeInTheDocument();
  });
});