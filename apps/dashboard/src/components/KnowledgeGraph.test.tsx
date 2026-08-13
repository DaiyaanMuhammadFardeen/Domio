import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { KnowledgeGraph } from './KnowledgeGraph';
import type { KnowledgeGraph as GraphData } from '../lib/knowledge-graph-service';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

const SEED: GraphData = {
  nodes: [
    { id: 'c-1', kind: 'claim', label: 'Q3 revenue grew 24% YoY' },
    { id: 's-1', kind: 'slide', label: 'Slide 12 — QBR deck' },
    { id: 'x-1', kind: 'citation', label: 'GAAP filing FY26-Q3' },
    { id: 'd-2', kind: 'deck', label: 'Investor update' },
    { id: 'c-2', kind: 'claim', label: 'Net retention 119%' },
    { id: 's-2', kind: 'slide', label: 'Slide 4 — Board pack' },
  ],
  edges: [
    { from: 'c-1', to: 's-1', kind: 'source_slide' },
    { from: 'c-1', to: 'x-1', kind: 'cites' },
    { from: 'c-1', to: 'd-2', kind: 'cross_deck' },
    { from: 'c-2', to: 's-2', kind: 'source_slide' },
  ],
  claims: [],
};

describe('KnowledgeGraph', () => {
  it('renders one SVG node per graph entry', () => {
    render(<KnowledgeGraph workspaceId="ws-demo" initial={SEED} />);
    expect(screen.getByTestId('knowledge-graph')).toBeInTheDocument();
    expect(screen.getByTestId('knowledge-graph-svg')).toBeInTheDocument();
    expect(screen.getAllByTestId('knowledge-node-claim')).toHaveLength(2);
    expect(screen.getAllByTestId('knowledge-node-slide')).toHaveLength(2);
    expect(screen.getAllByTestId('knowledge-node-citation')).toHaveLength(1);
    expect(screen.getAllByTestId('knowledge-node-deck')).toHaveLength(1);
  });

  it('renders an empty state when no nodes are provided', () => {
    render(<KnowledgeGraph workspaceId="ws-demo" initial={{ nodes: [], edges: [], claims: [] }} />);
    expect(screen.getByTestId('knowledge-graph-empty')).toBeInTheDocument();
  });

  it('surfaces the source slide + citation when a claim is clicked', () => {
    render(<KnowledgeGraph workspaceId="ws-demo" initial={SEED} />);
    const claim = screen
      .getAllByTestId('knowledge-node-claim')
      .find((el) => el.textContent?.includes('Q3 revenue'))!;
    fireEvent.click(claim);

    const preview = screen.getByTestId('knowledge-graph-preview');
    expect(preview).toBeInTheDocument();
    expect(preview).toHaveTextContent('Slide 12 — QBR deck');
    expect(preview).toHaveTextContent('GAAP filing FY26-Q3');
    expect(preview).toHaveTextContent('Investor update');
  });

  it('fetches the graph from /v1/analytics/graph when no initial data is provided', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => SEED,
    })) as unknown as typeof fetch;
    globalThis.fetch = mockFetch;
    process.env['NEXT_PUBLIC_WORKSPACE_ID'] = 'ws-demo';

    render(<KnowledgeGraph workspaceId="ws-demo" />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const calledArgs = (mockFetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0];
    expect(calledArgs?.[0]).toContain('/v1/analytics/graph');
    const headers = (calledArgs?.[1]?.headers ?? {}) as Record<string, string>;
    expect(headers['x-workspace-id']).toBe('ws-demo');
    expect(screen.getAllByTestId('knowledge-node-claim').length).toBeGreaterThan(0);
  });
});
