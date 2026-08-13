/**
 * Single blog post page — `/blog/[slug]`.
 *
 * Wave 12 §S12.10 — Blog. Server-rendered with `generateStaticParams`
 * for every post. The interactive body lives in `PostClient`.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { JSX } from 'react';
import { landing } from '@domio/ui';
import { BLOG_POSTS, BLOG_CATEGORY_LABELS } from '../../../lib/blog-data';
import { AuthorByline } from '../../../components/blog/AuthorByline';
import { PostClient } from './PostClient';

interface BlogPostParams {
  readonly params: Promise<{ readonly slug: string }>;
}

export function generateStaticParams(): ReadonlyArray<{ readonly slug: string }> {
  return BLOG_POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: BlogPostParams): Promise<Metadata> {
  const { slug } = await params;
  const post = BLOG_POSTS.find((p) => p.slug === slug);
  if (!post) {
    return { title: 'Post not found — Domio' };
  }
  return {
    title: `${post.title} — Domio blog`,
    description: post.excerpt,
  };
}

export default async function BlogPostPage({
  params,
}: BlogPostParams): Promise<JSX.Element> {
  const { slug } = await params;
  const post = BLOG_POSTS.find((p) => p.slug === slug);
  if (!post) {
    notFound();
  }

  const dateLabel = new Date(post.published_at_iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });

  const indexHref = landing('blog');

  return (
    <article className="blog-post" data-testid="blog-post">
      <header className="blog-post__head">
        <p className="blog-post__eyebrow">
          <a className="blog-post__back" href={indexHref}>
            ← All posts
          </a>
          <span aria-hidden="true"> · </span>
          <span className="blog-post__category">
            {BLOG_CATEGORY_LABELS[post.category]}
          </span>
        </p>
        <h1 className="blog-post__title">{post.title}</h1>
        <p className="blog-post__excerpt">{post.excerpt}</p>
        <div className="blog-post__meta">
          <AuthorByline author={post.author} />
          <span className="blog-post__meta-sep" aria-hidden="true">
            ·
          </span>
          <time
            className="blog-post__date"
            dateTime={post.published_at_iso}
          >
            {dateLabel}
          </time>
          <span className="blog-post__meta-sep" aria-hidden="true">
            ·
          </span>
          <span className="blog-post__reading">
            {post.reading_minutes} min read
          </span>
        </div>
        <ul className="blog-post__tags" aria-label="Tags">
          {post.tags.map((tag) => (
            <li key={tag} className="blog-post__tag">
              #{tag}
            </li>
          ))}
        </ul>
      </header>

      <PostClient body_md={post.body_md} />
    </article>
  );
}