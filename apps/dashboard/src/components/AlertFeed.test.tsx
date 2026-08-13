import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AlertFeed } from './AlertFeed';
import type { AlertEvent } from '../lib/alerts-service';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

const FIXED_NOW = Date.parse('2026-08-13T12:00:00Z');

describe('AlertFeed', () => {
  it('renders an empty state when there are no events', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ events: [] }),
    })) as unknown as typeof fetch;

    render(<AlertFeed workspaceId="ws-demo" pollIntervalMs={1_000_000} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.getByTestId('alert-feed')).toBeInTheDocument();
    expect(screen.getByText(/No alerts triggered yet/)).toBeInTheDocument();
  });

  it('renders events fetched from the dispatcher', async () => {
    const wire = {
      id: 'evt-1',
      rule_id: 'rule-1',
      metric: 'completion_rate',
      observed_value: 0.42,
      threshold: 0.5,
      triggered_at_ms: FIXED_NOW - 60_000,
      summary: 'QBR deck completion dropped below 50%',
    };

    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ events: [wire] }),
    })) as unknown as typeof fetch;

    render(
      <AlertFeed
        workspaceId="ws-demo"
        pollIntervalMs={1_000_000}
        initialEvents={[]}
      />,
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.getByText(/Completion rate = 0\.42/)).toBeInTheDocument();
    expect(screen.getByText(/QBR deck completion/)).toBeInTheDocument();
    expect(screen.getByTestId('alert-feed-list')).toBeInTheDocument();
  });

  it('renders initialEvents immediately without waiting for fetch', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ events: [] }),
    })) as unknown as typeof fetch;

    const seed: AlertEvent = {
      id: 'seed-1',
      ruleId: 'rule-2',
      metric: 'dlq_depth',
      observedValue: 7,
      threshold: 5,
      triggeredAtMs: FIXED_NOW - 5_000,
      summary: 'CRM DLQ exceeded threshold',
    };

    render(
      <AlertFeed
        workspaceId="ws-demo"
        pollIntervalMs={1_000_000}
        initialEvents={[seed]}
      />,
    );

    expect(screen.getByText(/DLQ depth = 7/)).toBeInTheDocument();
  });
});