import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CopilotHub } from './CopilotHub';
import type { JobRecord } from '../../lib/ai-service';

// ---------------------------------------------------------------------------
// Mocks — keep the test pure (no real fetch, no timers).
// ---------------------------------------------------------------------------

const mockJob: JobRecord = {
  id: 'job-test-1',
  intent: 'Build a Q4 deck',
  status: 'queued',
  phase: 'planning',
  createdAtMs: 1_700_000_000_000,
  updatedAtMs: 1_700_000_000_000,
  outlineId: 'outline-1',
  citationIds: ['cite-1'],
};

const createPlanner = vi.fn().mockResolvedValue(mockJob);
const ingestFileFn = vi.fn().mockResolvedValue({ fileId: 'file-1' });
const startVoiceToDeckFn = vi.fn().mockResolvedValue(mockJob);

beforeEach(() => {
  createPlanner.mockClear();
  ingestFileFn.mockClear();
  startVoiceToDeckFn.mockClear();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderHub(overrides: Partial<Parameters<typeof CopilotHub>[0]> = {}) {
  return render(
    <CopilotHub
      defaultOpen
      createPlanner={createPlanner}
      ingestFileFn={ingestFileFn}
      startVoiceToDeckFn={startVoiceToDeckFn}
      {...overrides}
    />,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CopilotHub', () => {
  it('renders closed toggle when defaultOpen=false', () => {
    render(<CopilotHub defaultOpen={false} />);
    const btn = screen.getByTestId('copilot-hub-toggle-open');
    expect(btn).toBeInTheDocument();
    expect(screen.queryByTestId('copilot-hub')).toBeNull();
  });

  it('renders the right-rail hub when open', () => {
    renderHub();
    expect(screen.getByTestId('copilot-hub')).toBeInTheDocument();
    expect(screen.getByText('AI Copilot')).toBeInTheDocument();
  });

  it('Cmd+J toggles open/closed', () => {
    render(<CopilotHub defaultOpen={false} hotkey="j" />);
    // Initially closed
    expect(screen.queryByTestId('copilot-hub')).toBeNull();

    fireEvent.keyDown(window, { key: 'j', metaKey: true });
    expect(screen.getByTestId('copilot-hub')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'j', metaKey: true });
    expect(screen.queryByTestId('copilot-hub')).toBeNull();
  });

  it('Ctrl+J also toggles (cross-platform)', () => {
    render(<CopilotHub defaultOpen={false} hotkey="j" />);
    fireEvent.keyDown(window, { key: 'j', ctrlKey: true });
    expect(screen.getByTestId('copilot-hub')).toBeInTheDocument();
  });

  it('close button hides the hub', () => {
    renderHub();
    expect(screen.getByTestId('copilot-hub')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('copilot-hub-toggle-close'));
    expect(screen.queryByTestId('copilot-hub')).toBeNull();
  });

  it('submitting a text prompt calls createPlanner', async () => {
    renderHub();
    const textarea = screen.getByTestId('copilot-prompt-text');
    fireEvent.change(textarea, { target: { value: 'Make a Q4 deck' } });
    fireEvent.click(screen.getByTestId('copilot-prompt-submit'));

    await waitFor(() => {
      expect(createPlanner).toHaveBeenCalledWith('Make a Q4 deck');
    });
  });

  it('renders JobProgress once a planner job is returned', async () => {
    renderHub();
    fireEvent.change(screen.getByTestId('copilot-prompt-text'), {
      target: { value: 'Pitch deck' },
    });
    fireEvent.click(screen.getByTestId('copilot-prompt-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('copilot-hub-current-job')).toBeInTheDocument();
      expect(screen.getByTestId('job-progress')).toBeInTheDocument();
    });
  });

  it('Submit button is disabled when text is empty', () => {
    renderHub();
    const submit = screen.getByTestId('copilot-prompt-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('Submit button is enabled when text has content', () => {
    renderHub();
    fireEvent.change(screen.getByTestId('copilot-prompt-text'), { target: { value: 'Hi' } });
    const submit = screen.getByTestId('copilot-prompt-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });

  it('does not submit an empty prompt', () => {
    renderHub();
    fireEvent.click(screen.getByTestId('copilot-prompt-submit'));
    // createPlanner should not have been called.
    expect(createPlanner).not.toHaveBeenCalled();
  });

  it('submit error is surfaced when createPlanner throws', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('offline'));
    render(
      <CopilotHub
        defaultOpen
        createPlanner={failing}
        ingestFileFn={ingestFileFn}
        startVoiceToDeckFn={startVoiceToDeckFn}
      />,
    );
    fireEvent.change(screen.getByTestId('copilot-prompt-text'), { target: { value: 'X' } });
    fireEvent.click(screen.getByTestId('copilot-prompt-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('copilot-hub-submit-error')).toHaveTextContent('offline');
    });
  });

  it('file attachment triggers ingestFileFn then createPlanner', async () => {
    renderHub();
    // Use the hidden file input.
    const input = screen.getByTestId('copilot-prompt-file-input') as HTMLInputElement;
    const file = new File(['hello'], 'notes.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByTestId('copilot-prompt-staged-file')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('copilot-prompt-submit'));

    await waitFor(() => {
      expect(ingestFileFn).toHaveBeenCalledWith(file);
      expect(createPlanner).toHaveBeenCalledWith('notes.pdf', 'file-1');
    });
  });

  it('voice recording stop calls startVoiceToDeckFn with blob', async () => {
    // jsdom doesn't ship MediaRecorder or getUserMedia, so we mock.
    // The mock's `stop` invokes the onstop handler, just like a real
    // MediaRecorder would.
    let lastRecorder: { onstop: (() => void) | null } | null = null;
    interface MockRecorder {
      ondataavailable: ((e: { data: Blob }) => void) | null;
      onstop: (() => void) | null;
      start: () => void;
      stop: () => void;
    }
    class MockMediaRecorder implements MockRecorder {
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start = vi.fn();
      stop = vi.fn((): void => {
        // Trigger the same code path a real MediaRecorder would:
        // when stop() is called, onstop fires synchronously.
        const handler = this.onstop;
        if (typeof handler === 'function') handler();
      });
      constructor() {
        // Track the most-recent recorder instance via an arrow-property
        // capture (avoids aliasing `this` to a local variable).
        lastRecorder = this as unknown as MockRecorder;
      }
    }
    Object.defineProperty(window, 'MediaRecorder', {
      configurable: true,
      writable: true,
      value: MockMediaRecorder,
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
        }),
      },
    });

    renderHub();
    fireEvent.click(screen.getByTestId('copilot-prompt-record'));

    await waitFor(() => {
      expect(lastRecorder).not.toBeNull();
    });

    fireEvent.click(screen.getByTestId('copilot-prompt-stop-record'));

    // Wait until startVoiceToDeckFn is called (with a Blob).
    await waitFor(() => {
      expect(startVoiceToDeckFn).toHaveBeenCalled();
      const blob = startVoiceToDeckFn.mock.calls[0]?.[0];
      expect(blob).toBeInstanceOf(Blob);
    });
  });

  it('history click re-opens runs createPlanner with the entry prompt', async () => {
    // Override fetchHistory via prop drilling is not exposed; instead we
    // mock listJobs by faking fetch globally.
    const historyJob: JobRecord = {
      ...mockJob,
      id: 'job-history-1',
      intent: 'Refresher on churn',
      createdAtMs: Date.now() - 60_000,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => [historyJob],
    }) as unknown as typeof fetch;

    render(<CopilotHub defaultOpen createPlanner={createPlanner} />);

    await waitFor(() => screen.getByTestId(`copilot-history-item-${historyJob.id}`));
    fireEvent.click(screen.getByTestId(`copilot-history-reopen-${historyJob.id}`));

    await waitFor(() => {
      expect(createPlanner).toHaveBeenCalledWith('Refresher on churn');
    });
  });

  it('history branch click creates a new branch job', async () => {
    const historyJob: JobRecord = {
      ...mockJob,
      id: 'job-history-2',
      intent: 'Pricing research',
      createdAtMs: Date.now() - 60_000,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => [historyJob],
    }) as unknown as typeof fetch;

    render(<CopilotHub defaultOpen createPlanner={createPlanner} />);

    await waitFor(() => screen.getByTestId(`copilot-history-item-${historyJob.id}`));
    fireEvent.click(screen.getByTestId(`copilot-history-branch-${historyJob.id}`));

    await waitFor(() => {
      expect(createPlanner).toHaveBeenCalledWith('Pricing research (branch)');
    });
  });
});
