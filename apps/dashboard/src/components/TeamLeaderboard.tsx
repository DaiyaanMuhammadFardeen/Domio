'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchCreatorLeaderboard, type CreatorRow, type TemplateRow } from '../lib/team-service';

export interface TeamLeaderboardProps {
  workspaceId: string;
  initialCreators?: ReadonlyArray<CreatorRow>;
  initialTemplates?: ReadonlyArray<TemplateRow>;
}

type FilterKey = 'all' | 'creator' | 'template';

/**
 * TeamLeaderboard — most-active creators + most-used templates.
 *
 * Renders a ranked table; toggle between creators and templates.
 * Data is fetched from the team-analytics service on mount.
 */
export function TeamLeaderboard({
  workspaceId,
  initialCreators,
  initialTemplates,
}: TeamLeaderboardProps) {
  const [creators, setCreators] = useState<ReadonlyArray<CreatorRow>>(initialCreators ?? []);
  const [templates, setTemplates] = useState<ReadonlyArray<TemplateRow>>(initialTemplates ?? []);
  const [filter, setFilter] = useState<FilterKey>('all');

  useEffect(() => {
    if (initialCreators !== undefined && initialTemplates !== undefined) return;
    let cancelled = false;
    async function load() {
      const data = await fetchCreatorLeaderboard(workspaceId);
      if (!cancelled) {
        setCreators(data.creators);
        setTemplates(data.templates);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, initialCreators, initialTemplates]);

  const visibleCreators = useMemo(
    () => [...creators].sort((a, b) => b.totalViews - a.totalViews),
    [creators],
  );
  const visibleTemplates = useMemo(
    () => [...templates].sort((a, b) => b.totalViews - a.totalViews),
    [templates],
  );

  const showCreators = filter !== 'template';
  const showTemplates = filter !== 'creator';

  return (
    <section className="rounded-xl border border-slate-200 bg-white" data-testid="team-leaderboard">
      <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          Leaderboard
        </h2>
        <div className="flex gap-1 text-xs" data-testid="leaderboard-filter">
          {(['all', 'creator', 'template'] as FilterKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              data-testid={`leaderboard-filter-${key}`}
              className={
                filter === key
                  ? 'rounded bg-brand-600 px-2 py-1 font-medium text-white'
                  : 'rounded px-2 py-1 font-medium text-slate-600 hover:bg-slate-200'
              }
            >
              {key === 'all' ? 'All' : key === 'creator' ? 'Creators' : 'Templates'}
            </button>
          ))}
        </div>
      </header>
      <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2">
        {showCreators ? (
          <div data-testid="leaderboard-creators">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Most active creators
            </h3>
            {visibleCreators.length === 0 ? (
              <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
                No creator activity reported yet.
              </p>
            ) : (
              <ol className="space-y-1 text-sm" data-testid="leaderboard-creators-list">
                {visibleCreators.map((c, i) => (
                  <li key={c.creatorId} className="flex justify-between">
                    <span className="text-slate-800">
                      <span className="mr-2 inline-block w-4 text-right text-slate-400">
                        {i + 1}.
                      </span>
                      {c.displayName}
                      <span className="ml-2 text-xs text-slate-500">{c.decksPublished} decks</span>
                    </span>
                    <span className="tabular-nums text-slate-500">
                      {c.totalViews.toLocaleString()} views
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : null}
        {showTemplates ? (
          <div data-testid="leaderboard-templates">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Most-used templates
            </h3>
            {visibleTemplates.length === 0 ? (
              <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
                No template usage yet.
              </p>
            ) : (
              <ol className="space-y-1 text-sm" data-testid="leaderboard-templates-list">
                {visibleTemplates.map((t, i) => (
                  <li key={t.templateId} className="flex justify-between">
                    <span className="text-slate-800">
                      <span className="mr-2 inline-block w-4 text-right text-slate-400">
                        {i + 1}.
                      </span>
                      {t.name}
                      <span className="ml-2 text-xs text-slate-500">
                        {t.workspaceCount} workspaces
                      </span>
                    </span>
                    <span className="tabular-nums text-slate-500">
                      {t.totalViews.toLocaleString()} views
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
