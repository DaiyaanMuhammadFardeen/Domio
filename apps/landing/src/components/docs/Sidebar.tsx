/**
 * Sidebar nav for the docs site.
 *
 * Server component — pure render from the static tree. Each section is
 * rendered as a labelled list of links. The active link gets a visual
 * marker; everything else is plain text.
 *
 * Per Wave 12 §S12.4 the sidebar lists every top-level section so the
 * nav stays useful as the docs grow.
 */

import type { JSX } from 'react';
import { landing } from '@domio/ui';
import { DOCS_TREE } from '../../lib/docs-tree';

export interface SidebarProps {
  readonly activeSlug?: ReadonlyArray<string>;
}

interface SidebarLinkSpec {
  readonly href: string;
  readonly label: string;
}

function buildSectionLinks(activeSlug: ReadonlyArray<string> | undefined): ReadonlyArray<{
  readonly sectionId: string;
  readonly title: string;
  readonly links: ReadonlyArray<SidebarLinkSpec>;
}> {
  return DOCS_TREE.map((section) => {
    const links: SidebarLinkSpec[] = section.pages.map((page) => {
      const href = landing('docs', { slug: `${section.id}/${page.slug}` });
      const label = page.title;
      return { href, label };
    });
    // Drop the trailing index page from the listing if it is redundant,
    // but keep it in the tree so /docs/<section>/index resolves cleanly.
    void activeSlug;
    return { sectionId: section.id, title: section.title, links };
  });
}

function isActive(activeSlug: ReadonlyArray<string> | undefined, sectionId: string, pageSlug: string): boolean {
  if (!activeSlug || activeSlug.length === 0) return false;
  if (activeSlug.length === 1 && activeSlug[0] === sectionId) {
    // Section index page is implicitly selected when only the section id
    // is on the URL (e.g. /docs/editor shows the editor index).
    return pageSlug === 'index';
  }
  if (activeSlug.length >= 2) {
    return activeSlug[0] === sectionId && activeSlug[1] === pageSlug;
  }
  return false;
}

export function Sidebar({ activeSlug }: SidebarProps): JSX.Element {
  const sections = buildSectionLinks(activeSlug);

  return (
    <nav className="docs-sidebar" aria-label="Documentation sections" data-testid="docs-sidebar">
      <ul className="docs-sidebar__list">
        {sections.map((section) => (
          <li key={section.sectionId} className="docs-sidebar__section">
            <h3 className="docs-sidebar__heading">{section.title}</h3>
            <ul className="docs-sidebar__pages">
              {section.links.map((link) => {
                const pageSlug = link.href.split('/').pop() ?? '';
                const active = isActive(activeSlug, section.sectionId, pageSlug);
                const className = active
                  ? 'docs-sidebar__link docs-sidebar__link--active'
                  : 'docs-sidebar__link';
                return (
                  <li key={link.href} className="docs-sidebar__page-item">
                    <a
                      href={link.href}
                      className={className}
                      aria-current={active ? 'page' : undefined}
                      data-testid="docs-sidebar-link"
                    >
                      {link.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default Sidebar;