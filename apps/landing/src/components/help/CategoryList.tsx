/**
 * CategoryList — the left rail sidebar of the Help center index.
 *
 * Lists every category with its article count and lets the user jump
 * straight to a category anchor on the page. The "All articles" entry
 * clears any active category filter so the wrapper can render the
 * full catalogue.
 */

import type { JSX } from 'react';
import type { KbCategory } from '../../lib/help-data';

export interface CategoryListProps {
  readonly categories: ReadonlyArray<KbCategory>;
  readonly activeId: string | null;
  readonly onSelect: (id: string | null) => void;
}

export function CategoryList({
  categories,
  activeId,
  onSelect,
}: CategoryListProps): JSX.Element {
  const allActive = activeId === null;
  return (
    <nav className="help-categories" data-testid="help-categories" aria-label="Categories">
      <h2 className="help-categories__heading">Categories</h2>
      <ul className="help-categories__list">
        <li className="help-categories__item">
          <button
            type="button"
            className={
              'help-categories__button' +
              (allActive ? ' help-categories__button--active' : '')
            }
            onClick={() => onSelect(null)}
            aria-pressed={allActive}
            data-testid="help-category-all"
          >
            <span className="help-categories__title">All articles</span>
            <span className="help-categories__count">
              {categories.reduce((sum, c) => sum + c.article_slugs.length, 0)}
            </span>
          </button>
        </li>
        {categories.map((category) => {
          const isActive = category.id === activeId;
          return (
            <li key={category.id} className="help-categories__item">
              <button
                type="button"
                className={
                  'help-categories__button' +
                  (isActive ? ' help-categories__button--active' : '')
                }
                onClick={() => onSelect(category.id)}
                aria-pressed={isActive}
                data-testid={`help-category-${category.id}`}
              >
                <span className="help-categories__title">{category.title}</span>
                <span className="help-categories__count">
                  {category.article_slugs.length}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default CategoryList;
