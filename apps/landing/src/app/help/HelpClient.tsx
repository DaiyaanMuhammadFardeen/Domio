/**
 * HelpClient — client wrapper for the Help center index.
 *
 * Owns the search query and the active category filter so the parent
 * server component can stay statically renderable. The wrapper lays
 * out the sidebar (search + categories) and the article grid; an
 * empty-results panel surfaces when nothing matches.
 */

'use client';

import { useMemo, useState, type JSX } from 'react';
import { ArticleCard } from '../../components/help/ArticleCard';
import { CategoryList } from '../../components/help/CategoryList';
import { SearchBar } from '../../components/help/SearchBar';
import {
  KB_ARTICLES,
  KB_CATEGORIES,
  searchArticles,
  type KbArticle,
  type KbCategory,
} from '../../lib/help-data';

export interface HelpClientProps {
  readonly initialCategories: ReadonlyArray<KbCategory>;
  readonly initialArticles: ReadonlyArray<KbArticle>;
}

export function HelpClient({ initialCategories, initialArticles }: HelpClientProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim();
    const base = q.length > 0 ? searchArticles(q) : initialArticles;
    if (activeCategory === null) return base;
    return base.filter((article) => article.category_id === activeCategory);
  }, [query, activeCategory, initialArticles]);

  const categoryMap = useMemo(() => {
    const map = new Map<string, KbCategory>();
    for (const category of initialCategories) {
      map.set(category.id, category);
    }
    return map;
  }, [initialCategories]);

  return (
    <div className="help-shell" data-testid="help-shell">
      <aside className="help-shell__sidebar" data-testid="help-sidebar">
        <SearchBar value={query} onChange={setQuery} resultCount={filtered.length} />
        <CategoryList
          categories={initialCategories}
          activeId={activeCategory}
          onSelect={setActiveCategory}
        />
      </aside>
      <main className="help-shell__main" data-testid="help-main">
        <header className="help-shell__intro">
          <h1 className="help-shell__title">Help center</h1>
          <p className="help-shell__lede">
            {KB_ARTICLES.length} searchable articles across {KB_CATEGORIES.length} categories. Pick
            a topic or use search to jump straight to the answer.
          </p>
        </header>
        {filtered.length === 0 ? (
          <div className="help-empty" data-testid="help-empty">
            <h2 className="help-empty__title">No articles match your search</h2>
            <p className="help-empty__body">
              Try a different keyword, clear the category filter, or jump over to the community for
              a quick answer.
            </p>
          </div>
        ) : (
          <section className="help-grid" data-testid="help-grid" aria-label="Help articles">
            {filtered.map((article) => (
              <ArticleCard
                key={article.slug}
                article={article}
                category={categoryMap.get(article.category_id)}
                href={`/help/${article.slug}`}
              />
            ))}
          </section>
        )}
      </main>
    </div>
  );
}

export default HelpClient;
