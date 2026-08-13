/**
 * RecordingExportButton tests — S4.12.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RecordingExportButton } from './RecordingExportButton';

function mockFetchSequence(
  responses: Array<{ status: number; body?: unknown }>,
): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => {
    const next = responses.shift() ?? { status: 200, body: {} };
    return new Response(JSON.stringify(next.body ?? {}), { status: next.status });
  });
  return fn;
}

describe('RecordingExportButton', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the start button by default', () => {
    render(<RecordingExportButton sessionId="sess-1" />);
    expect(screen.getByTestId('recording-export-button')).toHaveAttribute('data-state', 'idle');
    expect(screen.getByTestId('recording-export-button-start')).toBeInTheDocument();
  });

  it('surfaces a friendly error when the server returns 404', async () => {
    const fetchMock = mockFetchSequence([{ status: 404 }]);
    vi.stubGlobal('fetch', fetchMock);
    render(<RecordingExportButton sessionId="sess-2" />);
    fireEvent.click(screen.getByTestId('recording-export-button-start'));
    await waitFor(() => {
      expect(screen.getByTestId('recording-export-button-error')).toHaveTextContent(
        /not available/i,
      );
    });
    expect(screen.getByTestId('recording-export-button')).toHaveAttribute('data-state', 'failed');
    vi.unstubAllGlobals();
  });

  it('shows a download link once the export job reports ready', async () => {
    const fetchMock = mockFetchSequence([
      {
        status: 200,
        body: {
          job: {
            id: 'job-1',
            sessionId: 'sess-3',
            format: 'mp4',
            watermark: true,
            status: 'queued',
            progressPct: 0,
          },
        },
      },
      {
        status: 200,
        body: {
          job: {
            id: 'job-1',
            sessionId: 'sess-3',
            format: 'mp4',
            watermark: true,
            status: 'processing',
            progressPct: 35,
          },
        },
      },
      {
        status: 200,
        body: {
          job: {
            id: 'job-1',
            sessionId: 'sess-3',
            format: 'mp4',
            watermark: true,
            status: 'ready',
            progressPct: 100,
            downloadUrl: 'https://cdn.example/sess-3.mp4',
          },
        },
      },
    ]);
    vi.stubGlobal('fetch', fetchMock);
    const onReady = vi.fn();
    render(<RecordingExportButton sessionId="sess-3" apiBaseUrl="" onReady={onReady} />);
    fireEvent.click(screen.getByTestId('recording-export-button-start'));
    await waitFor(
      () => {
        expect(screen.getByTestId('recording-export-button')).toHaveAttribute(
          'data-state',
          'ready',
        );
      },
      { timeout: 8000, interval: 200 },
    );
    const link = screen.getByTestId('recording-export-button-download');
    expect(link).toHaveAttribute('href', 'https://cdn.example/sess-3.mp4');
    expect(link).toHaveAttribute('download', '');
    expect(onReady).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('exposes a retry button after a failed export', async () => {
    const fetchMock = mockFetchSequence([{ status: 500 }]);
    vi.stubGlobal('fetch', fetchMock);
    render(<RecordingExportButton sessionId="sess-4" />);
    fireEvent.click(screen.getByTestId('recording-export-button-start'));
    await waitFor(() => {
      expect(screen.getByTestId('recording-export-button-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('recording-export-button-retry')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
