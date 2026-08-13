'use client';

/**
 * PanelFooter — cross-link rail beneath the active editor panel.
 *
 * Per Wave 13 Phase C. Reads `EDITOR_CROSS_LINKS[panelId]` and renders
 * each entry as a `RelatedLinks` item using the typed `NavNode` shape.
 *
 * When a panel id has no entries, returns `null` so the layout doesn't
 * reserve space. Each link is mapped to:
 *   - surface = 'landing'  (these are landing pages)
 *   - category = 'docs' | 'feature' (driven by the path's prefix)
 *   - tagline = the optional tagline from the registry
 */

import type { JSX } from 'react';
import { RelatedLinks } from '@domio/ui';
import type { NavNode } from '@domio/ui';
import { EDITOR_CROSS_LINKS } from '../../lib/editor-cross-links';

export interface PanelFooterProps {
  readonly panelId: string;
}

function categoryForHref(href: string): 'docs' | 'feature' {
  if (href.includes('/docs/')) return 'docs';
  return 'feature';
}

function uniqueId(panelId: string, href: string): string {
  return `editor-${panelId}-${href}`;
}

export function PanelFooter({ panelId }: PanelFooterProps): JSX.Element | null {
  const links = EDITOR_CROSS_LINKS[panelId];
  if (!links || links.length === 0) return null;

  const items: ReadonlyArray<NavNode> = links.map((link) => {
    const node: NavNode = {
      id: uniqueId(panelId, link.href),
      surface: 'landing',
      category: categoryForHref(link.href),
      label: link.label,
      href: link.href,
    };
    if (link.tagline !== undefined) {
      return { ...node, tagline: link.tagline };
    }
    return node;
  });

  return (
    <div className="panel-footer" data-testid={`panel-footer-${panelId}`}>
      <RelatedLinks items={items} title="Learn more" />
    </div>
  );
}
