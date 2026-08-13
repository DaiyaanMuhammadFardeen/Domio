/**
 * AuthorByline — author name + role + initials avatar bubble.
 *
 * Wave 12 §S12.10 — Blog. Reused on post cards and the single-post
 * page header.
 */

import type { JSX } from 'react';
import type { BlogAuthor } from '../../lib/blog-data';

export interface AuthorBylineProps {
  readonly author: BlogAuthor;
  readonly compact?: boolean;
}

export function AuthorByline({ author, compact = false }: AuthorBylineProps): JSX.Element {
  return (
    <div className="blog-byline" data-testid="blog-author">
      <span className="blog-byline__avatar" aria-hidden="true">
        {author.avatar_initials}
      </span>
      <span className="blog-byline__text">
        <span className="blog-byline__name">{author.name}</span>
        {!compact && (
          <>
            <span className="blog-byline__sep" aria-hidden="true">
              ·
            </span>
            <span className="blog-byline__role">{author.role}</span>
          </>
        )}
      </span>
    </div>
  );
}

export default AuthorByline;
