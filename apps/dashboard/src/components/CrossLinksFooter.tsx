/**
 * CrossLinksFooter — per-route footer for the dashboard that shows the
 * navigation trail (breadcrumbs) + adjacent cross-links (RelatedLinks)
 * resolved from the local dashboard navigation graph.
 *
 * Per Wave 13 Phase D. Each dashboard page passes a `nodeId` that
 * identifies it in the graph below; the graph itself is intentionally
 * scoped to the dashboard surface so the central `NAV_GRAPH` in
 * `@domio/ui` stays decoupled from per-app route wiring.
 */

import type { ReactElement } from 'react';
import { Breadcrumbs, RelatedLinks } from '@domio/ui';

/**
 * The dashboard navigation graph. Each node represents a page (or
 * nearby surface) the user can reach from the dashboard. Edges are
 * flat id arrays resolved through `nodeById` below — keeping the
 * structure trivial to serialize and test.
 */
interface LocalNode {
  readonly id: string;
  readonly label: string;
  readonly tagline?: string;
  readonly href: string;
  readonly parent?: string;
  readonly siblings?: ReadonlyArray<string>;
  readonly seeAlso?: ReadonlyArray<string>;
}

const DASHBOARD_NODES: ReadonlyArray<LocalNode> = [
  {
    id: 'doc.dashboard.overview',
    label: 'Overview',
    tagline: 'Last 7 days, all workspaces',
    href: '/overview',
    siblings: ['doc.dashboard.decks', 'doc.dashboard.heatmap', 'doc.dashboard.benchmarks'],
    seeAlso: ['doc.dashboard.live', 'doc.dashboard.team'],
  },
  {
    id: 'doc.dashboard.decks',
    label: 'Decks',
    tagline: 'Per-deck analytics',
    href: '/deck',
    siblings: ['doc.dashboard.overview', 'doc.dashboard.heatmap', 'doc.dashboard.export'],
    seeAlso: ['doc.dashboard.benchmarks'],
  },
  {
    id: 'doc.dashboard.heatmap',
    label: 'Heatmap',
    tagline: 'Attention grid per slide',
    href: '/heatmap',
    siblings: ['doc.dashboard.decks', 'doc.dashboard.overview'],
    seeAlso: ['doc.dashboard.ab', 'doc.dashboard.team'],
  },
  {
    id: 'doc.dashboard.team',
    label: 'Team analytics',
    tagline: 'Templates, components, brand health, retention',
    href: '/team',
    siblings: ['doc.dashboard.overview', 'doc.dashboard.crm'],
    seeAlso: ['doc.dashboard.graph'],
  },
  {
    id: 'doc.dashboard.ab',
    label: 'A/B tests',
    tagline: 'Decisions from ab-measurement',
    href: '/ab',
    siblings: ['doc.dashboard.heatmap', 'doc.dashboard.benchmarks'],
    seeAlso: ['doc.dashboard.export'],
  },
  {
    id: 'doc.dashboard.crm',
    label: 'CRM sync',
    tagline: 'Adapter health + DLQ depth',
    href: '/crm',
    siblings: ['doc.dashboard.team', 'doc.dashboard.export'],
    seeAlso: ['doc.dashboard.overview'],
  },
  {
    id: 'doc.dashboard.live',
    label: 'Live HUD',
    tagline: 'Concurrent viewers, reactions',
    href: '/live',
    siblings: ['doc.dashboard.overview', 'doc.dashboard.crm'],
    seeAlso: ['doc.dashboard.team'],
  },
  {
    id: 'doc.dashboard.graph',
    label: 'Knowledge graph',
    tagline: 'Cross-deck connections',
    href: '/graph',
    siblings: ['doc.dashboard.overview', 'doc.dashboard.team'],
    seeAlso: ['doc.dashboard.heatmap'],
  },
  {
    id: 'doc.dashboard.benchmarks',
    label: 'Benchmarks',
    tagline: 'Industry + power analysis',
    href: '/benchmarks',
    siblings: ['doc.dashboard.overview', 'doc.dashboard.ab'],
    seeAlso: ['doc.dashboard.export'],
  },
  {
    id: 'doc.dashboard.export',
    label: 'Export',
    tagline: 'CSV / PDF jobs + scheduled reports',
    href: '/export',
    siblings: ['doc.dashboard.decks', 'doc.dashboard.crm'],
    seeAlso: ['doc.dashboard.benchmarks'],
  },
];

const BY_ID: ReadonlyMap<string, LocalNode> = new Map(
  DASHBOARD_NODES.map((n) => [n.id, n] as const),
);

function nodeById(id: string): LocalNode | null {
  return BY_ID.get(id) ?? null;
}

function breadcrumbsFor(node: LocalNode): ReadonlyArray<LocalNode> {
  const chain: LocalNode[] = [];
  const seen = new Set<string>();
  let current: LocalNode | null = node;
  let hops = 0;
  while (current && hops < 32) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    chain.unshift(current);
    if (!current.parent) break;
    current = nodeById(current.parent);
    hops += 1;
  }
  return Object.freeze(chain);
}

function relatedFor(node: LocalNode): ReadonlyArray<LocalNode> {
  const out: LocalNode[] = [];
  const seen = new Set<string>();
  const push = (id: string) => {
    if (seen.has(id)) return;
    const n = nodeById(id);
    if (!n || n.id === node.id) return;
    seen.add(id);
    out.push(n);
  };
  for (const id of node.siblings ?? []) push(id);
  for (const id of node.seeAlso ?? []) push(id);
  return Object.freeze(out);
}

export interface CrossLinksFooterProps {
  /** The local-graph node id for the current page. */
  readonly nodeId: string;
}

/**
 * Server-rendered footer with breadcrumbs + a 3-item related rail.
 * Falls back to nothing if `nodeId` is unknown — pages will simply
 * render no footer in that case.
 */
export function CrossLinksFooter({ nodeId }: CrossLinksFooterProps): ReactElement | null {
  const node = nodeById(nodeId);
  if (!node) return null;
  const crumbs = breadcrumbsFor(node);
  const related = relatedFor(node).slice(0, 3);
  return (
    <footer className="mt-12 space-y-6 border-t border-slate-200 pt-6" data-testid="cross-links-footer">
      {crumbs.length > 0 ? (
        <Breadcrumbs
          items={crumbs.map((c) => ({
            id: c.id,
            surface: 'dashboard' as const,
            category: 'analytics' as const,
            label: c.label,
            href: c.href,
          }))}
          testId="dashboard-breadcrumbs"
        />
      ) : null}
      <RelatedLinks
        items={related.map((r) => ({
          id: r.id,
          surface: 'dashboard' as const,
          category: 'analytics' as const,
          label: r.label,
          ...(r.tagline ? { tagline: r.tagline } : {}),
          href: r.href,
        }))}
        title="Jump to"
        testId="dashboard-related"
      />
    </footer>
  );
}
