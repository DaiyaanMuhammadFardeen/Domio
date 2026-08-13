/**
 * LayoutRepair — tests.
 *
 * Per Wave 6 §S6.9: render with a sample list of issues, click Fix,
 * verify the fix endpoint was called and a patch preview appeared.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LayoutRepair } from './LayoutRepair';
import { LocaleProvider } from '../../lib/locale';

function renderPanel(props: Partial<Parameters<typeof LayoutRepair>[0]> = {}) {
  return render(
    <LocaleProvider locale="en">
      <LayoutRepair {...props} />
    </LocaleProvider>,
  );
}

describe('LayoutRepair', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders the panel header and Scan button', () => {
    renderPanel();
    expect(screen.getByTestId('layout-repair-root')).toBeInTheDocument();
    expect(screen.getByText('Layout Repair')).toBeInTheDocument();
    expect(screen.getByTestId('layout-repair-scan-btn')).toBeInTheDocument();
  });

  it('clicking Scan calls /v1/ai/lint-layout', async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/ai/lint-layout')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            issues: [
              {
                id: 'iss-1',
                kind: 'overflow-text',
                slideId: 's1',
                elementId: 'e1',
                message: 'Title exceeds canvas',
                severity: 'high',
              },
            ],
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({}),
      } as Response;
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    renderPanel();
    fireEvent.click(screen.getByTestId('layout-repair-scan-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('layout-repair-issue-iss-1')).toBeInTheDocument();
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/ai/lint-layout'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('renders severity badge and kind label for each issue', async () => {
    const mockFetch = vi.fn(async (_input: RequestInfo | URL) => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        issues: [
          {
            id: 'iss-2',
            kind: 'misalignment',
            slideId: 's1',
            elementId: 'e2',
            message: 'Off-grid placement',
            severity: 'medium',
          },
        ],
      }),
    })) as unknown as typeof fetch;
    globalThis.fetch = mockFetch;

    renderPanel();
    fireEvent.click(screen.getByTestId('layout-repair-scan-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('layout-repair-severity-iss-2')).toHaveTextContent('medium');
    });
    expect(screen.getByTestId('layout-repair-issue-iss-2')).toHaveTextContent('Misaligned');
    expect(screen.getByTestId('layout-repair-issue-iss-2')).toHaveTextContent('Off-grid placement');
  });

  it('clicking Fix calls /v1/ai/lint-layout/fix and renders a patch', async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/ai/lint-layout')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            issues: [
              {
                id: 'iss-3',
                kind: 'overflow-text',
                slideId: 's1',
                elementId: 'e3',
                message: 'Cut-off body',
                severity: 'high',
              },
            ],
          }),
        } as Response;
      }
      if (url.endsWith('/v1/ai/lint-layout/fix')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            issueId: 'iss-3',
            patch: [{ op: 'resize', elementId: 'e3', width: 800, height: 400 }],
            before: 'Title overflows by 20px',
            after: 'Title fits within canvas',
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({}),
      } as Response;
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    renderPanel();
    fireEvent.click(screen.getByTestId('layout-repair-scan-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('layout-repair-issue-iss-3')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('layout-repair-fix-iss-3'));

    await waitFor(() => {
      expect(screen.getByTestId('layout-repair-patch')).toBeInTheDocument();
    });
    expect(screen.getByTestId('layout-repair-patch-before')).toHaveTextContent(
      'Title overflows by 20px',
    );
    expect(screen.getByTestId('layout-repair-patch-after')).toHaveTextContent(
      'Title fits within canvas',
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/ai/lint-layout/fix'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('Accept removes the issue from the list and invokes onAccept', async () => {
    const onAccept = vi.fn();
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/ai/lint-layout')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            issues: [
              {
                id: 'iss-4',
                kind: 'orphaned-element',
                slideId: 's1',
                elementId: 'e4',
                message: 'Stray dot',
                severity: 'low',
              },
            ],
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          issueId: 'iss-4',
          patch: [{ op: 'remove', elementId: 'e4' }],
          before: 'Orphaned dot present',
          after: 'Removed',
        }),
      } as Response;
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    renderPanel({ onAccept });
    fireEvent.click(screen.getByTestId('layout-repair-scan-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('layout-repair-fix-iss-4')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('layout-repair-fix-iss-4'));

    await waitFor(() => {
      expect(screen.getByTestId('layout-repair-accept-btn')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('layout-repair-accept-btn'));

    expect(onAccept).toHaveBeenCalledWith('iss-4', [{ op: 'remove', elementId: 'e4' }]);
    expect(screen.queryByTestId('layout-repair-issue-iss-4')).not.toBeInTheDocument();
  });

  it('Reject closes the patch preview without removing the issue', async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/ai/lint-layout')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            issues: [
              {
                id: 'iss-5',
                kind: 'overlap',
                slideId: 's1',
                elementId: 'e5',
                message: 'Cards overlap',
                severity: 'medium',
              },
            ],
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          issueId: 'iss-5',
          patch: [{ op: 'move', elementId: 'e5', x: 0, y: 0 }],
          before: 'Overlap',
          after: 'Separated',
        }),
      } as Response;
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    renderPanel();
    fireEvent.click(screen.getByTestId('layout-repair-scan-btn'));
    await waitFor(() => screen.getByTestId('layout-repair-fix-iss-5'));
    fireEvent.click(screen.getByTestId('layout-repair-fix-iss-5'));

    await waitFor(() => screen.getByTestId('layout-repair-reject-btn'));
    fireEvent.click(screen.getByTestId('layout-repair-reject-btn'));

    expect(screen.queryByTestId('layout-repair-patch')).not.toBeInTheDocument();
    expect(screen.getByTestId('layout-repair-issue-iss-5')).toBeInTheDocument();
  });

  it('shows empty state when no issues are found', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ issues: [] }),
    })) as unknown as typeof fetch;
    globalThis.fetch = mockFetch;

    renderPanel();
    fireEvent.click(screen.getByTestId('layout-repair-scan-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('layout-repair-empty')).toBeInTheDocument();
    });
  });
});
