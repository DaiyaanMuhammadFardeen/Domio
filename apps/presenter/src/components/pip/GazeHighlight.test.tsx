/**
 * GazeHighlight tests — S4.6.
 *
 * Verifies the highlight renders when enabled and clamps when the
 * gaze source is outside the slide.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { GazeHighlight } from './GazeHighlight';

describe('GazeHighlight', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when disabled', () => {
    render(<GazeHighlight enabled={false} slideWidth={1920} slideHeight={1080} />);
    expect(screen.queryByTestId('gaze-highlight')).toBeNull();
  });

  it('renders the highlight element when enabled', () => {
    (window as unknown as { __lastPointer?: { x: number; y: number } }).__lastPointer = {
      x: 0.5,
      y: 0.5,
    };
    render(<GazeHighlight enabled={true} slideWidth={1920} slideHeight={1080} />);
    // Advance one RAF so the placeholder tick runs.
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(screen.getByTestId('gaze-highlight')).toBeInTheDocument();
  });

  it('clamps the highlight when gaze leaves the slide', () => {
    (window as unknown as { __lastPointer?: { x: number; y: number } }).__lastPointer = {
      x: 1.5, // off the right edge
      y: -0.5, // off the top edge
    };
    render(<GazeHighlight enabled={true} slideWidth={1920} slideHeight={1080} />);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    const el = screen.getByTestId('gaze-highlight');
    expect(el.getAttribute('data-clamped')).toBe('true');
  });
});