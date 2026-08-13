/**
 * Single-article Help center route (Wave 12 §S12.9).
 *
 * Resolves an article from `params.slug`, 404s on unknown slugs, and
 * hands the resolved article (plus its category and related entries)
 * to the ArticleClient wrapper.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { JSX } from 'react';
import { ArticleClient } from './ArticleClient';
import {
  KB_ARTICLES,
  articleBySlug,
  categoryForSlug,
  type KbArticle,
} from '../../../lib/help-data';
import { PageShell } from '../../../components/layout/PageShell';

interface ArticleRouteParams {
  readonly slug: string;
}

interface ArticlePageProps {
  readonly params: Promise<ArticleRouteParams>;
}

function resolveRelated(slugs: ReadonlyArray<string>): ReadonlyArray<KbArticle> {
  const seen = new Set<string>();
  const out: KbArticle[] = [];
  for (const slug of slugs) {
    if (seen.has(slug)) continue;
    const article = articleBySlug(slug);
    if (article) {
      seen.add(slug);
      out.push(article);
    }
  }
  return out;
}

export async function generateMetadata({
  params,
}: ArticlePageProps): Promise<Metadata> {
  const resolved = await params;
  const article = articleBySlug(resolved.slug);
  if (!article) {
    return {
      title: 'Article — Domio Help',
      description: 'Domio help center article.',
    };
  }
  return {
    title: `${article.title} — Domio Help`,
    description: article.summary,
  };
}

export const dynamicParams = false;

export function generateStaticParams(): Array<ArticleRouteParams> {
  return KB_ARTICLES.map((article) => ({ slug: article.slug }));
}

export default async function HelpArticlePage({
  params,
}: ArticlePageProps): Promise<JSX.Element> {
  const resolved = await params;
  const article = articleBySlug(resolved.slug);
  if (!article) {
    notFound();
  }
  const category = categoryForSlug(article.category_id);
  const related = resolveRelated(article.related_slugs);

  return (
    <PageShell currentId="help-index" relatedTitle="Need more?" hideRelated>
      <ArticleClient article={article} category={category} related={related} />
    </PageShell>
  );
}