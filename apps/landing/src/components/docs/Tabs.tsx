/**
 * Tabs — client-side tabbed content surface.
 *
 * Authors pass an array of tabs with a label and a React node body;
 * the component renders a tab strip and the active panel. The first
 * tab is selected by default. Server components cannot toggle state,
 * so this component ships with `'use client'`.
 */

'use client';

import { useState, type JSX, type ReactNode } from 'react';

export interface DocsTabSpec {
  readonly label: string;
  readonly content: ReactNode;
}

export interface TabsProps {
  readonly tabs: ReadonlyArray<DocsTabSpec>;
  readonly initialIndex?: number;
}

export function Tabs({ tabs, initialIndex = 0 }: TabsProps): JSX.Element {
  const [active, setActive] = useState<number>(
    Math.max(0, Math.min(initialIndex, Math.max(tabs.length - 1, 0))),
  );

  if (tabs.length === 0) {
    return <div className="docs-tabs docs-tabs--empty" data-testid="docs-tabs" />;
  }

  const activeTab = tabs[active] ?? tabs[0]!;

  return (
    <div className="docs-tabs" data-testid="docs-tabs">
      <div className="docs-tabs__list" role="tablist" aria-label="Documentation tabs">
        {tabs.map((tab, index) => {
          const selected = index === active;
          return (
            <button
              key={tab.label}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`docs-tabpanel-${index}`}
              id={`docs-tab-${index}`}
              className={
                'docs-tabs__tab' + (selected ? ' docs-tabs__tab--active' : '')
              }
              onClick={() => setActive(index)}
              data-testid="docs-tab-button"
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab, index) => (
        <div
          key={tab.label}
          role="tabpanel"
          id={`docs-tabpanel-${index}`}
          aria-labelledby={`docs-tab-${index}`}
          hidden={index !== active}
          className="docs-tabs__panel"
          data-testid="docs-tab-panel"
        >
          {index === active ? tab.content : null}
        </div>
      ))}
      {/* Hidden helper so the active panel is always addressable for tests. */}
      <span hidden>{activeTab.label}</span>
    </div>
  );
}

export default Tabs;