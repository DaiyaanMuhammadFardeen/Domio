'use client';

/**
 * PanelRail — two-tier left rail for the editor.
 *
 * Per Wave 13 Phase C. Replaces the flat `editorPanels.list()` rail
 * with:
 *   - a sticky search input at the top (`<input data-testid="panel-search">`)
 *   - collapsible group headers (`button[aria-expanded]`)
 *   - panel tabs nested under each expanded group
 *
 * Two modes:
 *   - search empty → show groups; clicking a header toggles its panels
 *   - search non-empty → flatten all panels, hide group headers, show
 *     only matching labels (case-insensitive substring)
 *
 * Pure presentational: it owns local UI state (expanded groups and
 * search text) only. Selection is delegated through `onSelect`.
 *
 * BEM:
 *   .panel-rail                  — root
 *   .panel-rail__search          — search input wrapper
 *   .panel-rail__group           — group container
 *   .panel-rail__group-header    — group toggle button
 *   .panel-rail__group-list      — tabs list under a group
 *   .panel-rail__tab             — individual panel button
 */

import { useMemo, useState } from 'react';
import type { JSX } from 'react';

export interface PanelRailPanel {
  readonly id: string;
  readonly label: string;
  readonly group: string;
}

export interface PanelRailGroup {
  readonly id: string;
  readonly label: string;
}

export interface PanelRailProps {
  readonly panels: ReadonlyArray<PanelRailPanel>;
  readonly groups: ReadonlyArray<PanelRailGroup>;
  readonly activeId: string;
  readonly onSelect: (id: string) => void;
}

export function PanelRail({ panels, groups, activeId, onSelect }: PanelRailProps): JSX.Element {
  const [expanded, setExpanded] = useState<ReadonlyArray<string>>(() => groups.map((g) => g.id));
  const [search, setSearch] = useState<string>('');

  const trimmed = search.trim().toLowerCase();
  const isSearching = trimmed.length > 0;

  const filteredPanels = useMemo(() => {
    if (!isSearching) return panels;
    return panels.filter((p) => p.label.toLowerCase().includes(trimmed));
  }, [panels, trimmed, isSearching]);

  const toggleGroup = (groupId: string): void => {
    setExpanded((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId],
    );
  };

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') {
      setSearch('');
      e.preventDefault();
    }
  };

  return (
    <div className="panel-rail" role="navigation" aria-label="Editor panels">
      <div className="panel-rail__search">
        <input
          type="search"
          className="panel-rail__search-input"
          placeholder="Search panels"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={onSearchKeyDown}
          data-testid="panel-search"
          aria-label="Search panels"
        />
      </div>

      {isSearching ? (
        <ul className="panel-rail__group-list" role="list">
          {filteredPanels.length === 0 ? (
            <li className="panel-rail__empty" data-testid="panel-rail-empty" role="status">
              No panels match.
            </li>
          ) : (
            filteredPanels.map((panel) => (
              <li key={panel.id}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeId === panel.id}
                  className={`panel-rail__tab${activeId === panel.id ? ' is-active' : ''}`}
                  onClick={() => onSelect(panel.id)}
                  data-testid={`panel-tab-${panel.id}`}
                >
                  {panel.label}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : (
        groups.map((group) => {
          const groupPanels = filteredPanels.filter((p) => p.group === group.id);
          if (groupPanels.length === 0) return null;
          const isExpanded = expanded.includes(group.id);
          return (
            <div
              key={group.id}
              className="panel-rail__group"
              data-testid={`panel-group-${group.id}`}
            >
              <button
                type="button"
                className="panel-rail__group-header"
                aria-expanded={isExpanded}
                onClick={() => toggleGroup(group.id)}
              >
                <span className="panel-rail__group-caret" aria-hidden="true">
                  {isExpanded ? '▾' : '▸'}
                </span>
                <span data-testid="panel-group-label">{group.label}</span>
              </button>
              {isExpanded ? (
                <ul className="panel-rail__group-list" role="list">
                  {groupPanels.map((panel) => (
                    <li key={panel.id}>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={activeId === panel.id}
                        className={`panel-rail__tab${activeId === panel.id ? ' is-active' : ''}`}
                        onClick={() => onSelect(panel.id)}
                        data-testid={`panel-tab-${panel.id}`}
                      >
                        {panel.label}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}
