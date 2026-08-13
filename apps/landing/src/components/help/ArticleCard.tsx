/**
 * ArticleCard — a single KB article preview tile.
 *
 * Renders the article's title, summary, and category badge, plus a
 * read-more arrow. Each card is a link to the article's slug page.
 */

import type { JSX } from 'react';
import type { KbArticle, KbCategory } from '../../lib/help-data';

export interface ArticleCardProps {
  readonly article: KbArticle;
  readonly category: KbCategory | undefined;
  readonly href: string;
}

function formatDate(iso: string): string {
  // We render a short, locale-stable date — no client-only formatting.
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return iso;
  const [, year, month, day] = match;
  return `${year}-${month}-${day}`;
}

export function ArticleCard({ article, category, href }: ArticleCardProps): JSX.Element {
  return (
    <article className="help-card" data-testid={`help-article-${article.slug}`}>
      {category ? (
        <span className="help-card__category" data-testid={`help-article-category-${article.slug}`}>
          {category.title}
        </span>
      ) : null}
      <h3 className="help-card__title">
        <a className="help-card__title-link" href={href} data-testid="help-article-link">
          {article.title}
        </a>
      </h3>
      <p className="help-card__summary">{article.summary}</p>
      <footer className="help-card__footer">
        <time
          className="help-card__updated"
          dateTime={article.updated_at_iso}
          data-testid={`help-article-updated-${article.slug}`}
        >
          Updated {formatDate(article.updated_at_iso)}
        </time>
        <a
          className="help-card__cta"
          href={href}
          aria-label={`Read article: ${article.title}`}
          data-testid="help-article-read"
        >
          Read article →
        </a>
      </footer>
    </article>
  );
}

export default ArticleCard;
