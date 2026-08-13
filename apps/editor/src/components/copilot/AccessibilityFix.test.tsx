/**
 * AccessibilityFix — tests.
 *
 * Per Wave 6 §S6.9: render with a sample of issues, click Fix, verify
 * the audit + fix endpoints were called and a patch preview appeared.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AccessibilityFix } from './AccessibilityFix';
import { LocaleProvider } from '../../lib/locale';

function renderPanel(props: Partial<Parameters<typeof AccessibilityFix>[0]> = {}) {
  return render(
    <LocaleProvider locale="en">
      <AccessibilityFix {...props} />
    </LocaleProvider>,
  );
}

describe('AccessibilityFix', () => {
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
    expect(screen.getByTestId('a11y-fix-root')).toBeInTheDocument();
    expect(screen.getByText('Accessibility Fix')).toBeInTheDocument();
    expect(screen.getByTestId('a11y-fix-scan-btn')).toBeInTheDocument();
  });

  it('clicking Scan calls /v1/ai/accessibility-audit', async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/ai/accessibility-audit')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            issues: [
              {
                id: 'a-1',
                kind: 'missing-alt-text',
                slideId: 's1',
                elementId: 'img1',
                message: 'Hero image has no alt',
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
    fireEvent.click(screen.getByTestId('a11y-fix-scan-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('a11y-fix-issue-a-1')).toBeInTheDocument();
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/ai/accessibility-audit'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('renders the kind label for each issue', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        issues: [
          {
            id: 'a-2',
            kind: 'missing-caption',
            slideId: 's1',
            elementId: 'v1',
            message: 'No caption for video',
            severity: 'medium',
          },
          {
            id: 'a-3',
            kind: 'reading-order',
            slideId: 's2',
            elementId: 't1',
            message: 'Title appears after body',
            severity: 'low',
          },
        ],
      }),
    })) as unknown as typeof fetch;
    globalThis.fetch = mockFetch;

    renderPanel();
    fireEvent.click(screen.getByTestId('a11y-fix-scan-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('a11y-fix-issue-a-2')).toBeInTheDocument();
    });
    expect(screen.getByTestId('a11y-fix-issue-a-2')).toHaveTextContent('Missing caption');
    expect(screen.getByTestId('a11y-fix-issue-a-3')).toHaveTextContent('Reading order');
  });

  it('clicking Fix calls /v1/ai/accessibility-audit/fix and renders a patch', async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/ai/accessibility-audit')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            issues: [
              {
                id: 'a-4',
                kind: 'missing-alt-text',
                slideId: 's1',
                elementId: 'img2',
                message: 'Photo has no alt',
                severity: 'high',
              },
            ],
          }),
        } as Response;
      }
      if (url.endsWith('/v1/ai/accessibility-audit/fix')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            issueId: 'a-4',
            patch: [{ op: 'set-alt', elementId: 'img2', alt: 'A bar chart of Q4 revenue' }],
            before: '<img src="x" />',
            after: '<img src="x" alt="A bar chart of Q4 revenue" />',
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
    fireEvent.click(screen.getByTestId('a11y-fix-scan-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('a11y-fix-issue-a-4')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('a11y-fix-fix-a-4'));

    await waitFor(() => {
      expect(screen.getByTestId('a11y-fix-patch')).toBeInTheDocument();
    });
    expect(screen.getByTestId('a11y-fix-patch-after')).toHaveTextContent(
      'A bar chart of Q4 revenue',
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/ai/accessibility-audit/fix'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('Accept removes the issue from the list and invokes onAccept', async () => {
    const onAccept = vi.fn();
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/ai/accessibility-audit')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            issues: [
              {
                id: 'a-5',
                kind: 'reading-order',
                slideId: 's1',
                elementId: 't2',
                message: 'Title after body',
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
          issueId: 'a-5',
          patch: [{ op: 'reorder', elementId: 't2', index: 0 }],
          before: 'Body… Title',
          after: 'Title… Body',
        }),
      } as Response;
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    renderPanel({ onAccept });
    fireEvent.click(screen.getByTestId('a11y-fix-scan-btn'));

    await waitFor(() => screen.getByTestId('a11y-fix-fix-a-5'));
    fireEvent.click(screen.getByTestId('a11y-fix-fix-a-5'));

    await waitFor(() => screen.getByTestId('a11y-fix-accept-btn'));
    fireEvent.click(screen.getByTestId('a11y-fix-accept-btn'));

    expect(onAccept).toHaveBeenCalledWith('a-5', [{ op: 'reorder', elementId: 't2', index: 0 }]);
    expect(screen.queryByTestId('a11y-fix-issue-a-5')).not.toBeInTheDocument();
  });

  it('Reject closes the patch preview without removing the issue', async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/ai/accessibility-audit')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            issues: [
              {
                id: 'a-6',
                kind: 'missing-caption',
                slideId: 's1',
                elementId: 'v2',
                message: 'No captions',
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
          issueId: 'a-6',
          patch: [{ op: 'set-caption', elementId: 'v2', caption: 'Demo caption' }],
          before: '<video />',
          after: '<video><track>captions</track></video>',
        }),
      } as Response;
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    renderPanel();
    fireEvent.click(screen.getByTestId('a11y-fix-scan-btn'));
    await waitFor(() => screen.getByTestId('a11y-fix-fix-a-6'));
    fireEvent.click(screen.getByTestId('a11y-fix-fix-a-6'));

    await waitFor(() => screen.getByTestId('a11y-fix-reject-btn'));
    fireEvent.click(screen.getByTestId('a11y-fix-reject-btn'));

    expect(screen.queryByTestId('a11y-fix-patch')).not.toBeInTheDocument();
    expect(screen.getByTestId('a11y-fix-issue-a-6')).toBeInTheDocument();
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
    fireEvent.click(screen.getByTestId('a11y-fix-scan-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('a11y-fix-empty')).toBeInTheDocument();
    });
  });
});
