import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { CRMTimeline } from './CRMTimeline';
import type { AdapterHealth } from '../lib/crm-service';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

const FIXED_NOW = Date.parse('2026-08-13T12:00:00Z');

describe('CRMTimeline', () => {
  it('renders an empty state when there are no events and no adapters', () => {
    render(<CRMTimeline workspaceId="ws-demo" />);
    expect(screen.getByTestId('crm-timeline')).toBeInTheDocument();
    expect(screen.getByText(/No CRM events yet/)).toBeInTheDocument();
  });

  it('renders timeline events from the wire payload', async () => {
    const wire = {
      id: 'evt-1',
      contact_id: 'c-1',
      contact_name: 'Ada Lovelace',
      provider: 'Salesforce',
      kind: 'contact_synced',
      summary: 'Synced to SFDC',
      occurred_at_ms: FIXED_NOW - 60_000,
    };

    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ events: [wire] }),
    })) as unknown as typeof fetch;

    render(<CRMTimeline workspaceId="ws-demo" />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText(/contact synced/i)).toBeInTheDocument();
    expect(screen.getByText('Synced to SFDC')).toBeInTheDocument();
    expect(screen.getByTestId('crm-event-list')).toBeInTheDocument();
  });

  it('renders adapter rows with retry buttons and POSTs retry', async () => {
    const adapters: AdapterHealth[] = [
      { provider: 'HubSpot', status: 'down', lastRunMs: FIXED_NOW - 300_000, avgDurationMs: 320 },
    ];
    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ events: [] }),
    })) as unknown as typeof fetch;
    globalThis.fetch = mockFetch;

    render(<CRMTimeline workspaceId="ws-demo" adapters={adapters} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.getByTestId('crm-adapter-row')).toBeInTheDocument();
    const retryBtn = screen.getByTestId('crm-adapter-retry');
    fireEvent.click(retryBtn);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const retryCall = (
      mockFetch as unknown as { mock: { calls: [string, RequestInit][] } }
    ).mock.calls.find((c) => c[0].includes('/v1/crm/syncs/retry'));
    expect(retryCall).toBeDefined();
    expect(retryCall![0]).toContain('provider=HubSpot');
    expect(retryCall![1].method).toBe('POST');
  });
});
