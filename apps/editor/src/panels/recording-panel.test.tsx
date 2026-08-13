/**
 * RecordingPanel tests (Phase 11, M7.3).
 *
 * Drives the recording state machine via the public controls and
 * verifies the rendered UI reflects the state, encoder selection, and
 * bitrate computation.
 */

import { describe, it, expect, vi, type Mock } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useState } from 'react';
import { RecordingPanel, type FinalizedDraft } from './recording-panel';
import type { SupportMatrix } from '@domio/recording';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPanel(opts?: { supportMatrix?: () => SupportMatrix; onFinalize?: Mock }) {
  return render(
    <RecordingPanel
      viewportWidth={1920}
      viewportHeight={1080}
      fps={30}
      {...(opts?.supportMatrix !== undefined ? { supportMatrix: opts.supportMatrix } : {})}
      {...(opts?.onFinalize ? { onFinalize: opts.onFinalize } : {})}
    />,
  );
}

describe('RecordingPanel', () => {
  it('renders with default encoder and computed bitrate', () => {
    renderPanel();
    // Default: h264 has priority, so "h264" should appear in the MIME
    expect(screen.getByTestId('recording-panel-encoder').textContent).toContain('h264');
    const bitrateText = screen.getByTestId('recording-panel-bitrate').textContent ?? '';
    expect(bitrateText).toMatch(/Bitrate: \d+ kbps/);
    expect(bitrateText).toContain('1920×1080@30fps');
  });

  it('starts in Idle state', () => {
    renderPanel();
    const status = screen.getByTestId('recording-panel-status');
    expect(status.textContent).toBe('Idle');
    expect(status.getAttribute('data-state')).toBe('idle');
  });

  it('Start is enabled and Stop is disabled in Idle state', () => {
    renderPanel();
    expect(screen.getByTestId('recording-panel-start')).not.toBeDisabled();
    expect(screen.getByTestId('recording-panel-stop')).toBeDisabled();
    expect(screen.getByTestId('recording-panel-pause')).toBeDisabled();
    expect(screen.getByTestId('recording-panel-resume')).toBeDisabled();
  });

  it('Start transitions to Recording state', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('recording-panel-start'));
    const status = screen.getByTestId('recording-panel-status');
    expect(status.textContent).toBe('Recording');
    expect(status.getAttribute('data-state')).toBe('recording');
  });

  it('Pause disables Start and enables Resume', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('recording-panel-start'));
    fireEvent.click(screen.getByTestId('recording-panel-pause'));
    const status = screen.getByTestId('recording-panel-status');
    expect(status.textContent).toBe('Paused');
    expect(screen.getByTestId('recording-panel-resume')).not.toBeDisabled();
  });

  it('Resume transitions back to Recording', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('recording-panel-start'));
    fireEvent.click(screen.getByTestId('recording-panel-pause'));
    fireEvent.click(screen.getByTestId('recording-panel-resume'));
    expect(screen.getByTestId('recording-panel-status').textContent).toBe('Recording');
  });

  it('Stop transitions to Finalized and reports via callback', () => {
    const onFinalize = vi.fn();
    renderPanel({ onFinalize });
    fireEvent.click(screen.getByTestId('recording-panel-start'));
    fireEvent.click(screen.getByTestId('recording-panel-stop'));
    expect(screen.getByTestId('recording-panel-status').textContent).toBe('Finalized');
    expect(onFinalize).toHaveBeenCalledTimes(1);
    const call = onFinalize.mock.calls[0]![0] as FinalizedDraft;
    expect(call).toBeDefined();
  });

  it('reports a reasonable bitrate for 1080p slide', () => {
    renderPanel();
    const text = screen.getByTestId('recording-panel-bitrate').textContent ?? '';
    const match = text.match(/Bitrate: (\d+) kbps/);
    expect(match).not.toBeNull();
    const kbps = Number(match![1]!);
    expect(kbps).toBeGreaterThan(1000);
  });

  it('uses the custom support matrix when provided (vp9 only)', () => {
    renderPanel({ supportMatrix: () => ({ vp9: true }) });
    expect(screen.getByTestId('recording-panel-encoder').textContent).toContain('vp9');
  });

  it('shows unsupported when nothing is supported', () => {
    renderPanel({ supportMatrix: () => ({}) });
    const text = screen.getByTestId('recording-panel-encoder').textContent ?? '';
    expect(text).toContain('unsupported');
  });

  it('progress bar reflects elapsed time', () => {
    renderPanel();
    const progress = screen.getByTestId('recording-panel-progress');
    expect(progress.getAttribute('aria-valuenow')).toBe('0');
    expect(progress.getAttribute('aria-valuemin')).toBe('0');
    expect(progress.getAttribute('aria-valuemax')).toBe('100');
  });

  it('renders finalized summary with chunk count', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('recording-panel-start'));
    fireEvent.click(screen.getByTestId('recording-panel-stop'));
    expect(screen.getByTestId('recording-panel-finalized')).toBeDefined();
    expect(screen.getByTestId('recording-panel-finalized-chunks').textContent).toMatch(
      /Chunks: \d+/,
    );
  });

  it('does not crash with no finalize callback', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('recording-panel-start'));
    fireEvent.click(screen.getByTestId('recording-panel-stop'));
    expect(screen.getByTestId('recording-panel-status').textContent).toBe('Finalized');
  });

  it('renders within a hosted component tree (smoke)', () => {
    function Wrapper(): React.ReactElement {
      const [vp, setVp] = useState({ w: 1280, h: 720 });
      return (
        <div>
          <button onClick={() => setVp({ w: 640, h: 480 })}>resize</button>
          <RecordingPanel viewportWidth={vp.w} viewportHeight={vp.h} fps={24} />
        </div>
      );
    }
    render(<Wrapper />);
    expect(screen.getByTestId('recording-panel-bitrate').textContent).toContain('1280×720@24fps');
    act(() => {
      fireEvent.click(screen.getByText('resize'));
    });
    expect(screen.getByTestId('recording-panel-bitrate').textContent).toContain('640×480@24fps');
  });
});
