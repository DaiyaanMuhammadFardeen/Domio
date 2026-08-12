/**
 * ExportDialog tests — S3.8.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createContext } from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ExportDialog } from './ExportDialog';
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
    id: 'export-1',
    deckId: 'd1',
    format: 'pdf',
    status: 'queued',
    createdAtMs: Date.now(),
    ...overrides,
  };
}

describe('ExportDialog', () => {
  it('does not render when closed', () => {
    render(
      withLocale(
        <ExportDialog
          deckId="d1"
          deckTitle="Demo"
          slideCount={5}
          open={false}
          onClose={vi.fn()}
        />,
      ),
    );
    expect(screen.queryByTestId('export-dialog')).toBeNull();
  });

  it('renders format + quality + range when open', () => {
    render(
      withLocale(
        <ExportDialog
          deckId="d1"
          deckTitle="Demo"
          slideCount={5}
          open
          onClose={vi.fn()}
        />,
      ),
    );
    expect(screen.getByTestId('export-dialog-format-pdf')).toBeInTheDocument();
    expect(screen.getByTestId('export-dialog-format-pptx')).toBeInTheDocument();
    expect(screen.getByTestId('export-dialog-format-mp4')).toBeInTheDocument();
    expect(screen.getByTestId('export-dialog-quality')).toBeInTheDocument();
    expect(screen.getByTestId('export-dialog-from')).toBeInTheDocument();
    expect(screen.getByTestId('export-dialog-to')).toBeInTheDocument();
  });

  it('queues an export with the selected options', async () => {
    const onQueue = vi.fn().mockResolvedValue(makeJob({ id: 'export-x', status: 'running', percent: 10, remainingSlides: 4 }));
    render(
      withLocale(
        <ExportDialog
          deckId="d1"
          deckTitle="Demo"
          slideCount={5}
          open
          onClose={vi.fn()}
          onQueue={onQueue}
        />,
      ),
    );
    fireEvent.click(screen.getByTestId('export-dialog-format-pptx'));
    fireEvent.submit(screen.getByTestId('export-dialog-queue').closest('form')!);
    await waitFor(() => expect(onQueue).toHaveBeenCalled());
    const arg = onQueue.mock.calls[0]?.[0] as { format: string; range: { fromIdx: number; toIdx: number } };
    expect(arg.format).toBe('pptx');
    expect(arg.range.fromIdx).toBe(0);
    expect(arg.range.toIdx).toBe(4);
  });

  it('switches to the progress view after queue', async () => {
    const onQueue = vi.fn().mockResolvedValue(makeJob({ status: 'running', percent: 25, remainingSlides: 3 }));
    render(
      withLocale(
        <ExportDialog
          deckId="d1"
          deckTitle="Demo"
          slideCount={5}
          open
          onClose={vi.fn()}
          onQueue={onQueue}
        />,
      ),
    );
    fireEvent.click(screen.getByTestId('export-dialog-queue'));
    const tracker = await screen.findByTestId('export-dialog-progress', {}, { timeout: 2000 });
    expect(tracker).toBeInTheDocument();
    expect(screen.getByTestId('export-dialog-progress-status').textContent).toBe('running');
    expect(screen.getByTestId('export-dialog-progress-percent').textContent).toBe('25%');
  });

  it('shows an error message when queueing fails', async () => {
    const onQueue = vi.fn().mockRejectedValue(new Error('boom'));
    render(
      withLocale(
        <ExportDialog
          deckId="d1"
          deckTitle="Demo"
          slideCount={5}
          open
          onClose={vi.fn()}
          onQueue={onQueue}
        />,
      ),
    );
    fireEvent.submit(screen.getByTestId('export-dialog-queue').closest('form')!);
    await waitFor(() => expect(screen.getByTestId('export-dialog-error')).toBeInTheDocument());
    expect(screen.getByTestId('export-dialog-error').textContent).toContain('boom');
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(
      withLocale(
        <ExportDialog
          deckId="d1"
          deckTitle="Demo"
          slideCount={5}
          open
          onClose={onClose}
        />,
      ),
    );
    fireEvent.click(screen.getByTestId('export-dialog-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('clamps the range fields when the user enters out-of-bounds values', () => {
    render(
      withLocale(
        <ExportDialog
          deckId="d1"
          deckTitle="Demo"
          slideCount={5}
          open
          onClose={vi.fn()}
        />,
      ),
    );
    const toInput = screen.getByTestId('export-dialog-to') as HTMLInputElement;
    fireEvent.change(toInput, { target: { value: '999' } });
    expect(toInput.value).toBe('5');
  });
});
