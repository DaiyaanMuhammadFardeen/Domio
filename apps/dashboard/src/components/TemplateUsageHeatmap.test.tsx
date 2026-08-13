import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { TemplateUsageHeatmap } from './TemplateUsageHeatmap';
import type { TemplateUsageCell } from '../lib/team-service';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

const SEED: TemplateUsageCell[] = [
  {
    templateId: 't-1',
    templateName: 'Sales pitch',
    category: 'sales',
    engagement: 82,
    views: 12_300,
  },
  {
    templateId: 't-1',
    templateName: 'Sales pitch',
    category: 'investor',
    engagement: 41,
    views: 4_200,
  },
  {
    templateId: 't-2',
    templateName: 'Investor update',
    category: 'investor',
    engagement: 67,
    views: 8_900,
  },
];

describe('TemplateUsageHeatmap', () => {
  it('renders one row per template with cells for each category', () => {
    render(<TemplateUsageHeatmap workspaceId="ws-demo" initialCells={SEED} />);
    expect(screen.getByTestId('template-heatmap')).toBeInTheDocument();
    const rows = screen.getAllByTestId('heatmap-row');
    expect(rows).toHaveLength(2);
    expect(screen.getAllByTestId('heatmap-cell').length).toBeGreaterThan(0);
    expect(screen.getByText('Sales pitch')).toBeInTheDocument();
    expect(screen.getByText('Investor update')).toBeInTheDocument();
  });

  it('renders an empty state when no cells are provided', () => {
    render(<TemplateUsageHeatmap workspaceId="ws-demo" initialCells={[]} />);
    expect(screen.getByText(/No template usage reported yet/)).toBeInTheDocument();
  });

  it('fetches cells when no initial data is provided', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ cells: SEED }),
    })) as unknown as typeof fetch;
    globalThis.fetch = mockFetch;
    process.env['NEXT_PUBLIC_WORKSPACE_ID'] = 'ws-demo';

    render(<TemplateUsageHeatmap workspaceId="ws-demo" />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const calledArgs = (
      mockFetch as unknown as { mock: { calls: [string, RequestInit][] } }
    ).mock.calls[0];
    expect(calledArgs?.[0]).toContain('/v1/analytics/team/template-usage');
    const headers = (calledArgs?.[1]?.headers ?? {}) as Record<string, string>;
    expect(headers['x-workspace-id']).toBe('ws-demo');
    expect(screen.getAllByTestId('heatmap-row').length).toBeGreaterThan(0);
  });
});