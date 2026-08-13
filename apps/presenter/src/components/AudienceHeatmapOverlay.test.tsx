/**
 * AudienceHeatmapOverlay tests — S4.14.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AudienceHeatmapOverlay, type AudienceEvent } from './AudienceHeatmapOverlay';

const EVENTS: AudienceEvent[] = [
  { id: 'a', x: 0.1, y: 0.2, kind: 'click', ts: Date.now() },
  { id: 'b', x: 0.5, y: 0.5, kind: 'whisper', ts: Date.now() },
  { id: 'c', x: 0.9, y: 0.7, kind: 'vote', ts: Date.now() },
];

describe('AudienceHeatmapOverlay', () => {
  it('renders one dot per recent event', () => {
    render(<AudienceHeatmapOverlay events={EVENTS} ttlMs={60_000} />);
    expect(screen.getByTestId('audience-heatmap-overlay')).toHaveAttribute('data-count', '3');
    expect(screen.getAllByTestId('audience-heatmap-overlay-dot').length).toBe(3);
  });

  it('hides events older than ttlMs', () => {
    const old: AudienceEvent[] = [
      { id: 'old', x: 0.5, y: 0.5, kind: 'click', ts: Date.now() - 30_000 },
    ];
    render(<AudienceHeatmapOverlay events={old} ttlMs={5_000} />);
    expect(screen.getByTestId('audience-heatmap-overlay')).toHaveAttribute('data-count', '0');
    expect(screen.queryAllByTestId('audience-heatmap-overlay-dot').length).toBe(0);
  });

  it('marks the dot with the event kind', () => {
    render(<AudienceHeatmapOverlay events={EVENTS} ttlMs={60_000} />);
    const dots = screen.getAllByTestId('audience-heatmap-overlay-dot');
    expect(dots.map((d) => d.getAttribute('data-kind'))).toEqual(['click', 'whisper', 'vote']);
  });

  it('handles an empty events list without crashing', () => {
    render(<AudienceHeatmapOverlay events={[]} />);
    expect(screen.getByTestId('audience-heatmap-overlay')).toHaveAttribute('data-count', '0');
  });
});
