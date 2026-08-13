/**
 * BlogClient — client wrapper that holds the active category filter
 * and re-renders the post list when the user clicks a chip.
 *
 * Wave 12 §S12.10 — Blog. Server passes the full post list down so
 * filtering is purely client-side and instant.
 */

'use client';

import { useMemo, useState, type JSX } from 'react';
import { CategoryFilter } from '../../components/blog/CategoryFilter';
import { PostCard } from '../../components/blog/PostCard';
import {
  BLOG_CATEGORY_LABELS,
  type BlogCategory,
  type BlogPost,
} from '../../lib/blog-data';

export interface BlogClientProps {
  readonly posts: ReadonlyArray<BlogPost>;
}

export function BlogClient({ posts }: BlogClientProps): JSX.Element {
  const [active, setActive] = useState<BlogCategory | 'all'>('all');

  const visible = useMemo(() => {
    if (active === 'all') return posts;
    return posts.filter((p) => p.category === active);
  }, [posts, active]);

  return (
    <>
      <CategoryFilter selected={active} onSelect={setActive} />
      <p className="blog-index__count" data-testid="blog-index-count">
        {visible.length} {visible.length === 1 ? 'post' : 'posts'}
        {active !== 'all' ? ` in ${BLOG_CATEGORY_LABELS[active]}` : ''}
      </p>
      {visible.length === 0 ? (
        <p className="blog-index__empty">No posts in this category yet.</p>
      ) : (
        <ul className="blog-index__list">
          {visible.map((post) => (
            <li key={post.slug} className="blog-index__item">
              <PostCard post={post} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default BlogClient;