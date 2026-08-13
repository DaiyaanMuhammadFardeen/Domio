/**
 * PostCard — single blog post preview card.
 *
 * Wave 12 §S12.10 — Blog. Renders title, excerpt, author byline,
 * category, and tags. Links to the full post on the public landing
 * site.
 */

import type { JSX } from 'react';
import { landing } from '@domio/ui';
import { BLOG_CATEGORY_LABELS, type BlogPost } from '../../lib/blog-data';
import { AuthorByline } from './AuthorByline';

export interface PostCardProps {
  readonly post: BlogPost;
}

export function PostCard({ post }: PostCardProps): JSX.Element {
  const href = landing('blog-post', { slug: post.slug });
  const dateLabel = new Date(post.published_at_iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <article className="blog-card" data-testid="blog-post-card">
      <header className="blog-card__head">
        <span className="blog-card__category" data-testid="blog-post-category">
          {BLOG_CATEGORY_LABELS[post.category]}
        </span>
        <span className="blog-card__meta">
          <time dateTime={post.published_at_iso}>{dateLabel}</time>
          <span aria-hidden="true"> · </span>
          <span>{post.reading_minutes} min read</span>
        </span>
      </header>
      <h2 className="blog-card__title">
        <a href={href} className="blog-card__link">
          {post.title}
        </a>
      </h2>
      <p className="blog-card__excerpt">{post.excerpt}</p>
      <AuthorByline author={post.author} />
      <ul className="blog-card__tags" aria-label="Tags">
        {post.tags.map((tag) => (
          <li key={tag} className="blog-card__tag">
            #{tag}
          </li>
        ))}
      </ul>
    </article>
  );
}

export default PostCard;
