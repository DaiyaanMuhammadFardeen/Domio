import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { TeamLeaderboard } from './TeamLeaderboard';
import type { CreatorRow, TemplateRow } from '../lib/team-service';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

const CREATORS: CreatorRow[] = [
  {
    creatorId: 'u-1',
    displayName: 'Ada Lovelace',
    decksPublished: 14,
    totalViews: 24_300,
  },
  {
    creatorId: 'u-2',
    displayName: 'Alan Turing',
    decksPublished: 9,
    totalViews: 11_800,
  },
];

const TEMPLATES: TemplateRow[] = [
  { templateId: 't-1', name: 'Sales pitch', workspaceCount: 412, totalViews: 91_233 },
  { templateId: 't-2', name: 'Investor update', workspaceCount: 287, totalViews: 38_412 },
];

describe('TeamLeaderboard', () => {
  it('renders creators and templates from initial data', () => {
    render(
      <TeamLeaderboard
        workspaceId="ws-demo"
        initialCreators={CREATORS}
        initialTemplates={TEMPLATES}
      />,
    );

    expect(screen.getByTestId('team-leaderboard')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Alan Turing')).toBeInTheDocument();
    expect(screen.getByText('Sales pitch')).toBeInTheDocument();
    expect(screen.getByText('Investor update')).toBeInTheDocument();
  });

  it('toggles between creators / templates / all', () => {
    render(
      <TeamLeaderboard
        workspaceId="ws-demo"
        initialCreators={CREATORS}
        initialTemplates={TEMPLATES}
      />,
    );

    // default 'all' shows both
    expect(screen.getByTestId('leaderboard-creators')).toBeInTheDocument();
    expect(screen.getByTestId('leaderboard-templates')).toBeInTheDocument();

    // 'creator' shows only creators
    fireEvent.click(screen.getByTestId('leaderboard-filter-creator'));
    expect(screen.getByTestId('leaderboard-creators')).toBeInTheDocument();
    expect(screen.queryByTestId('leaderboard-templates')).toBeNull();

    // 'template' shows only templates
    fireEvent.click(screen.getByTestId('leaderboard-filter-template'));
    expect(screen.queryByTestId('leaderboard-creators')).toBeNull();
    expect(screen.getByTestId('leaderboard-templates')).toBeInTheDocument();
  });

  it('fetches from the leaderboard endpoint when no initial data is provided', async () => {
    const wire = {
      creators: [
        {
          creator_id: 'u-1',
          display_name: 'Ada Lovelace',
          decks_published: 14,
          total_views: 24_300,
        },
        {
          creator_id: 'u-2',
          display_name: 'Alan Turing',
          decks_published: 9,
          total_views: 11_800,
        },
      ],
      templates: [
        { template_id: 't-1', name: 'Sales pitch', workspace_count: 412, total_views: 91_233 },
        { template_id: 't-2', name: 'Investor update', workspace_count: 287, total_views: 38_412 },
      ],
    };
    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => wire,
    })) as unknown as typeof fetch;
    globalThis.fetch = mockFetch;
    process.env['NEXT_PUBLIC_WORKSPACE_ID'] = 'ws-demo';

    render(<TeamLeaderboard workspaceId="ws-demo" />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const calledArgs = (mockFetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0];
    expect(calledArgs?.[0]).toContain('/v1/analytics/team/leaderboard');
    const headers = (calledArgs?.[1]?.headers ?? {}) as Record<string, string>;
    expect(headers['x-workspace-id']).toBe('ws-demo');
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });
});
