/**
 * RehearsalRecorder tests — S4.5.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RehearsalRecorder, type RehearsalSlideStat } from './RehearsalRecorder';

const STATS: RehearsalSlideStat[] = [
  { slide_id: 's1', title: 'Intro', actual_ms: 55_000, target_ms: 60_000 }, // 92% — green
  { slide_id: 's2', title: 'Body', actual_ms: 72_000, target_ms: 60_000 }, // 120% — yellow
  { slide_id: 's3', title: 'Conclusion', actual_ms: 90_000, target_ms: 60_000 }, // 150% — red
];

describe('RehearsalRecorder', () => {
  it('renders an empty-state when no stats are provided', () => {
    render(<RehearsalRecorder stats={[]} />);
    expect(screen.getByTestId('rehearsal-recorder-empty')).toBeInTheDocument();
  });

  it('renders each slide with a colored badge', () => {
    render(<RehearsalRecorder stats={STATS} />);
    expect(screen.getByTestId('rehearsal-recorder-row-s1')).toBeInTheDocument();
    expect(screen.getByTestId('rehearsal-recorder-row-s2')).toBeInTheDocument();
    expect(screen.getByTestId('rehearsal-recorder-row-s3')).toBeInTheDocument();
  });

  it('shows the actual/target ratio as a percentage', () => {
    render(<RehearsalRecorder stats={STATS} />);
    expect(screen.getByTestId('rehearsal-recorder-badge-s1').textContent).toBe('92%');
    expect(screen.getByTestId('rehearsal-recorder-badge-s2').textContent).toBe('120%');
    expect(screen.getByTestId('rehearsal-recorder-badge-s3').textContent).toBe('150%');
  });

  it('uses success color when on or under target', () => {
    render(
      <RehearsalRecorder
        stats={[{ slide_id: 's1', title: 'On', actual_ms: 60_000, target_ms: 60_000 }]}
      />,
    );
    const badge = screen.getByTestId('rehearsal-recorder-badge-s1');
    expect(badge.style.background).toContain('--success');
  });

  it('uses danger color when over 120% of target', () => {
    render(
      <RehearsalRecorder
        stats={[{ slide_id: 's1', title: 'Slow', actual_ms: 80_000, target_ms: 60_000 }]}
      />,
    );
    const badge = screen.getByTestId('rehearsal-recorder-badge-s1');
    expect(badge.style.background).toContain('--danger');
  });
});
