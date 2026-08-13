/**
 * GazeHighlight tests — S11.3.
 *
 * Verifies the highlight renders when enabled+calibrated and clamps when
 * the gaze source is outside the slide.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { GazeHighlight } from './GazeHighlight';
import { saveGazeCalibration } from '../../lib/gaze-service';

describe('GazeHighlight', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await saveGazeCalibration([
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.1, y: 0.5 },
      { x: 0.5, y: 0.5 },
      { x: 0.9, y: 0.5 },
      { x: 0.1, y: 0.9 },
      { x: 0.5, y: 0.9 },
      { x: 0.9, y: 0.9 },
    ]);
  });
  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it('renders nothing when disabled', () => {
    render(<GazeHighlight enabled={false} slideWidth={1920} slideHeight={1080} />);
    expect(screen.queryByTestId('gaze-highlight')).toBeNull();
  });

  it('renders the highlight element when enabled, opted-in, and calibrated', async () => {
    (window as unknown as { __lastPointer?: { x: number; y: number } }).__lastPointer = {
      x: 0.5,
      y: 0.5,
    };
    render(<GazeHighlight enabled={true} slideWidth={1920} slideHeight={1080} />);
    // Click the Enable button to open the privacy modal.
    const enableBtn = screen.getByTestId('gaze-highlight-enable');
    await act(async () => {
      fireEvent.click(enableBtn);
    });
    // Confirm the privacy notice.
    const confirmBtn = await screen.findByTestId('gaze-highlight-privacy-confirm');
    await act(async () => {
      fireEvent.click(confirmBtn);
    });
    // Let the RAF loop tick at least once.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.getByTestId('gaze-highlight')).toBeInTheDocument();
  });

  it('clamps the highlight when gaze leaves the slide', async () => {
    (window as unknown as { __lastPointer?: { x: number; y: number } }).__lastPointer = {
      x: 1.5,
      y: -0.5,
    };
    render(<GazeHighlight enabled={true} slideWidth={1920} slideHeight={1080} />);
    const enableBtn = screen.getByTestId('gaze-highlight-enable');
    await act(async () => {
      fireEvent.click(enableBtn);
    });
    const confirmBtn = await screen.findByTestId('gaze-highlight-privacy-confirm');
    await act(async () => {
      fireEvent.click(confirmBtn);
    });
    // Let the RAF loop tick at least once.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    const el = screen.getByTestId('gaze-highlight');
    expect(el.getAttribute('data-clamped')).toBe('true');
  });
});