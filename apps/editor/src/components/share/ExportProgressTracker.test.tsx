/**
 * ExportProgressTracker tests — S3.8.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { createContext } from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ExportProgressTracker } from './ExportProgressTracker';
import type { ExportJob } from './ExportProgressTracker';

const enFile = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../messages/en.json',
);
const enMessages = JSON.parse(fs.readFileSync(enFile, 'utf8')) as Record<string, string>;

const FormattedMessageContext = createContext<Readonly<Record<string, string>>>({});

vi.mock('@domio/ui', async () => {
  const actual = await vi.importActual<typeof import('@domio/ui')>('@domio/ui');
  const React = await import('react');
  return {
    ...actual,
    FormattedMessage: function MockFormattedMessage(props: {
      id: string;
      values?: Readonly<Record<string, string | number>>;
    }): React.ReactElement {
      const catalogue = React.useContext(FormattedMessageContext);
      let resolved = catalogue[props.id] ?? props.id;
      if (props.values) {
        for (const [k, v] of Object.entries(props.values)) {
          resolved = resolved.replaceAll(`{${k}}`, String(v));
        }
      }
      return <span>{resolved}</span>;
    },
  };
});

function withLocale(node: React.ReactElement): React.ReactElement {
  return (
    <FormattedMessageContext.Provider value={enMessages}>
      {node}
    </FormattedMessageContext.Provider>
  );
}

function makeJob(overrides: Partial<ExportJob> = {}): ExportJob {
  return {
    id: 'j1',
    deckId: 'd1',
    format: 'pdf',
    status: 'running',
    percent: 50,
    remainingSlides: 3,
    createdAtMs: Date.now(),
    ...overrides,
  };
}

describe('ExportProgressTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the percent bar', () => {
    render(withLocale(<ExportProgressTracker job={makeJob()} />));
    expect(screen.getByTestId('export-progress-tracker-percent').textContent).toBe('50%');
  });

  it('shows the download link when the job is done', () => {
    render(
      withLocale(
        <ExportProgressTracker
          job={makeJob({ status: 'done', percent: 100, downloadUrl: 'https://cdn/x.pdf' })}
        />,
      ),
    );
    const a = screen.getByTestId('export-progress-tracker-download') as HTMLAnchorElement;
    expect(a.href).toContain('cdn/x.pdf');
    expect(a.getAttribute('download')).not.toBeNull();
  });

  it('renders an error message when the job failed', () => {
    render(
      withLocale(
        <ExportProgressTracker job={makeJob({ status: 'failed', error: 'out of memory' })} />,
      ),
    );
    expect(screen.getByRole('alert').textContent).toContain('out of memory');
  });

  it('polls onPoll while the job is running and updates the bar', async () => {
    let n = 0;
    const onPoll = vi.fn(async () => ({
      job: makeJob({ status: 'running', percent: 25 * (++n), remainingSlides: 4 - n }),
    }));
    render(withLocale(<ExportProgressTracker job={makeJob({ percent: 0 })} onPoll={onPoll} />));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
    expect(onPoll).toHaveBeenCalled();
    expect(screen.getByTestId('export-progress-tracker-percent').textContent).not.toBe('0%');
  });

  it('stops polling and fires onComplete when the job reaches done', async () => {
    const onPoll = vi.fn(async () => ({
      job: makeJob({ status: 'done', percent: 100, downloadUrl: 'https://cdn/x.pdf' }),
    }));
    const onComplete = vi.fn();
    render(
      withLocale(
        <ExportProgressTracker job={makeJob({ status: 'running' })} onPoll={onPoll} onComplete={onComplete} />,
      ),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
    expect(onComplete).toHaveBeenCalled();
    expect(onComplete.mock.calls[0]?.[0].status).toBe('done');
  });

  it('emits onProgress on every tick', async () => {
    const onPoll = vi.fn(async () => ({ job: makeJob({ status: 'running', percent: 75 }) }));
    const onProgress = vi.fn();
    render(
      withLocale(
        <ExportProgressTracker job={makeJob({ status: 'running' })} onPoll={onPoll} onProgress={onProgress} />,
      ),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
    expect(onProgress).toHaveBeenCalled();
    expect(onProgress.mock.calls[0]?.[0].job.percent).toBe(75);
  });

  it('shows remaining slides when present', () => {
    render(withLocale(<ExportProgressTracker job={makeJob({ remainingSlides: 7 })} />));
    expect(screen.getByTestId('export-progress-tracker-remaining').textContent).toContain('7');
  });
});