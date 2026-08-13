/**
 * Docs catch-all route.
 *
 * Wave 12 §S12.4 — Next 15 catch-all `[[...slug]]` over the docs tree.
 *   - `/docs`            → renders the first section's index page
 *   - `/docs/<section>`  → renders that section's index page
 *   - `/docs/<section>/<page>` → renders that specific page
 *
 * Unknown sections render the docs index. Unknown pages inside a
 * known section render the section index. Both cases fall through to
 * a helpful 404-equivalent.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { JSX } from 'react';
import {
  DOCS_TREE,
  type DocsPage,
  type DocsSection,
} from '../../../lib/docs-tree';
import { DocsClient } from './DocsClient';

interface DocsRouteParams {
  readonly slug?: ReadonlyArray<string>;
}

function resolveSection(sectionId: string | undefined): DocsSection | undefined {
  if (!sectionId) return DOCS_TREE[0];
  return DOCS_TREE.find((s) => s.id === sectionId);
}

function resolvePage(section: DocsSection, pageSlug: string | undefined): DocsPage {
  if (!pageSlug) {
    const idx = section.pages.find((p) => p.slug === 'index') ?? section.pages[0]!;
    return idx;
  }
  const found = section.pages.find((p) => p.slug === pageSlug);
  if (found) return found;
  // Fall back to the section index.
  return section.pages.find((p) => p.slug === 'index') ?? section.pages[0]!;
}

interface DocsPageProps {
  readonly params: Promise<DocsRouteParams>;
}

export async function generateMetadata({ params }: DocsPageProps): Promise<Metadata> {
  const resolved = await params;
  const slug = resolved.slug ?? [];
  const sectionId = slug[0];
  const pageSlug = slug[1];

  const section = resolveSection(sectionId);
  if (!section) {
    return {
      title: 'Docs — Domio',
      description: 'Documentation, guides, and API reference for Domio.',
    };
  }
  const page = resolvePage(section, pageSlug);
  return {
    title: `${page.title} — Domio docs`,
    description: `${page.title} · ${section.title}`,
  };
}

export default async function DocsPage({ params }: DocsPageProps): Promise<JSX.Element> {
  const resolved = await params;
  const slug = resolved.slug ?? [];
  const sectionId = slug[0];
  const pageSlug = slug[1];

  const section = resolveSection(sectionId);
  if (!section) {
    notFound();
  }

  const page = resolvePage(section, pageSlug);

  return <DocsClient section={section} page={page} slugSegments={slug} />;
}

export const dynamic = 'force-dynamic';