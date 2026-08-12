/**
 * VideoTrimmer — Wave 2 §S2.10 unit tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VideoTrimmer } from './VideoTrimmer';

describe('VideoTrimmer', () => {
  it('renders the timeline', () => {
    render(
      <VideoTrimmer
        durationMs={10000}
        value={{ startMs: 0, endMs: 10000 }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('video-trimmer')).toBeInTheDocument();
    expect(screen.getByTestId('video-trimmer-selection')).toBeInTheDocument();
  });

  it('emits onChange when start changes', () => {
    const onChange = vi.fn();
    render(
      <VideoTrimmer
        durationMs={10000}
        value={{ startMs: 0, endMs: 10000 }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByTestId('video-trimmer-start'), { target: { value: '1000' } });
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as { startMs: number };
    expect(next.startMs).toBe(1000);
  });

  it('emits onChange when end changes', () => {
    const onChange = vi.fn();
    render(
      <VideoTrimmer
        durationMs={10000}
        value={{ startMs: 0, endMs: 10000 }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByTestId('video-trimmer-end'), { target: { value: '9000' } });
    expect(onChange).toHaveBeenCalled();
  });
});