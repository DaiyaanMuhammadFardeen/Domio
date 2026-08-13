/**
 * ArticleClient — single-article body + related links.
 *
 * Renders the article title, summary, the multi-paragraph body, the
 * category breadcrumb, and a "related articles" rail at the bottom.
 * The body is plain text split on blank lines (matching the docs
 * route) so authors can edit copy without a markdown pipeline.
 */

import type { JSX } from 'react';
import type { KbArticle, KbCategory } from '../../../lib/help-data';

export interface ArticleClientProps {
  readonly article: KbArticle;
  readonly category: KbCategory | undefined;
  readonly related: ReadonlyArray<KbArticle>;
}

function renderParagraphs(body: string): JSX.Element {
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return (
    <>
      {paragraphs.map((para, index) => (
        <p key={index} className="help-article__paragraph">
          {para}
        </p>
      ))}
    </>
  );
}

function formatDate(iso: string): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return iso;
  const [, year, month, day] = match;
  return `${year}-${month}-${day}`;
}

export function ArticleClient({ article, category, related }: ArticleClientProps): JSX.Element {
  return (
    <article className="help-article" data-testid={`help-article-detail-${article.slug}`}>
      <nav className="help-article__breadcrumb" aria-label="Breadcrumb">
        <a
          className="help-article__breadcrumb-link"
          href="/help"
          data-testid="help-article-breadcrumb-index"
        >
          Help center
        </a>
        {category ? (
          <>
            <span aria-hidden="true"> / </span>
            <span className="help-article__breadcrumb-category">{category.title}</span>
          </>
        ) : null}
      </nav>

      <header className="help-article__header">
        <h1 className="help-article__title">{article.title}</h1>
        <p className="help-article__summary">{article.summary}</p>
        <p className="help-article__meta">
          <time
            className="help-article__updated"
            dateTime={article.updated_at_iso}
            data-testid="help-article-detail-updated"
          >
            Updated {formatDate(article.updated_at_iso)}
          </time>
        </p>
      </header>

      <div className="help-article__body" data-testid="help-article-body">
        {renderParagraphs(article.body_md)}
      </div>

      {related.length > 0 ? (
        <section
          className="help-article__related"
          aria-label="Related articles"
          data-testid="help-article-related"
        >
          <h2 className="help-article__related-heading">Related articles</h2>
          <ul className="help-article__related-list">
            {related.map((item) => (
              <li key={item.slug} className="help-article__related-item">
                <a
                  className="help-article__related-link"
                  href={`/help/${item.slug}`}
                  data-testid={`help-article-related-link-${item.slug}`}
                >
                  {item.title}
                </a>
                <span className="help-article__related-summary">{item.summary}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="help-article__footer">
        <a className="help-article__back" href="/help" data-testid="help-article-back">
          ← Back to Help center
        </a>
        <a
          className="help-article__community"
          href="/community"
          data-testid="help-article-community"
        >
          Still stuck? Ask the community →
        </a>
      </footer>
    </article>
  );
}

export default ArticleClient;
