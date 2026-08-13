/**
 * ExportJobsClient — tests.
 *
 * Verifies job queueing + polling + empty-state render. The
 * `fetch()` is mocked so the test runs without a live export service.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ExportJobsClient } from './ExportJobsClient';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('ExportJobsClient', () => {
  it('renders the empty state when no jobs exist', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ jobs: [] }),
    })) as unknown as typeof fetch;

    render(<ExportJobsClient workspaceId="ws-demo" pollIntervalMs={1_000_000} />);
    await waitFor(() => {
      expect(screen.getByTestId('export-empty')).toBeInTheDocument();
    });
  });

  it('queues a CSV export and shows the new job', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'job-1',
            workspace_id: 'ws-demo',
            format: 'csv',
            status: 'queued',
            created_at_ms: Date.now(),
            updated_at_ms: Date.now(),
          }),
        };
      }
      if (url.includes('/v1/exports/jobs') && !init?.method) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            jobs: [
              {
                id: 'job-1',
                workspace_id: 'ws-demo',
                format: 'csv',
                status: 'queued',
                created_at_ms: Date.now(),
                updated_at_ms: Date.now(),
              },
            ],
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(<ExportJobsClient workspaceId="ws-demo" pollIntervalMs={1_000_000} />);
    fireEvent.click(screen.getByTestId('queue-csv'));

    await waitFor(() => {
      expect(screen.getByTestId('export-job-list')).toBeInTheDocument();
    });
    expect(screen.getAllByTestId('export-job').length).toBeGreaterThan(0);
  });

  it('shows the download link once the job is done with a download URL', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/v1/exports/jobs/job-1') && !init?.method) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'job-1',
            workspace_id: 'ws-demo',
            format: 'csv',
            status: 'done',
            download_url: 'https://exports.test/job-1.csv',
            created_at_ms: Date.now() - 60_000,
            updated_at_ms: Date.now(),
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          jobs: [
            {
              id: 'job-1',
              workspace_id: 'ws-demo',
              format: 'csv',
              status: 'done',
              download_url: 'https://exports.test/job-1.csv',
              created_at_ms: Date.now() - 60_000,
              updated_at_ms: Date.now(),
            },
          ],
        }),
      };
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(<ExportJobsClient workspaceId="ws-demo" pollIntervalMs={1_000_000} />);

    await waitFor(() => {
      expect(screen.getByTestId('export-download')).toBeInTheDocument();
    });
    const link = screen.getByTestId('export-download');
    expect(link.getAttribute('href')).toBe('https://exports.test/job-1.csv');
  });

  it('does not show a download link for non-done jobs', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        jobs: [
          {
            id: 'job-2',
            workspace_id: 'ws-demo',
            format: 'pdf',
            status: 'running',
            created_at_ms: Date.now(),
            updated_at_ms: Date.now(),
          },
        ],
      }),
    })) as unknown as typeof fetch;

    render(<ExportJobsClient workspaceId="ws-demo" pollIntervalMs={1_000_000} />);

    await waitFor(() => {
      expect(screen.getByTestId('export-job-list')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('export-download')).toBeNull();
  });

  it('renders export-error when queueing fails', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    render(<ExportJobsClient workspaceId="ws-demo" pollIntervalMs={1_000_000} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('queue-csv'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('export-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('export-error').textContent).toMatch(/network down/);
  });
});
