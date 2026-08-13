/**
 * RSS feed route — `/blog/rss.xml`.
 *
 * Wave 12 §S12.10 — Blog. Returns an RSS 2.0 document with one
 * `<item>` per post. Served with the canonical
 * `application/rss+xml; charset=utf-8` content-type so feed readers
 * pick it up without manual configuration.
 */

import { BLOG_POSTS } from '../../../lib/blog-data';

const SITE_TITLE = 'Domio blog';
const SITE_DESCRIPTION =
  'Engineering, product, customer, and company updates from the Domio team.';
const SITE_LANGUAGE = 'en-us';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^-\s+/gm, '• ')
    .replace(/\n+/g, ' ')
    .trim();
}

function getOrigin(): string {
  if (process.env['NEXT_PUBLIC_SITE_URL']) {
    return process.env['NEXT_PUBLIC_SITE_URL']!;
  }
  if (process.env['VERCEL_URL']) {
    return `https://${process.env['VERCEL_URL']}`;
  }
  return 'https://domio.app';
}

function buildRssXml(): string {
  const origin = getOrigin().replace(/\/$/, '');
  const feedUrl = `${origin}/blog/rss.xml`;
  const homeUrl = `${origin}/blog`;
  const lastBuildDate = new Date(
    BLOG_POSTS[0]?.published_at_iso ?? new Date().toISOString(),
  ).toUTCString();

  const items = BLOG_POSTS.map((post) => {
    const link = `${origin}/blog/${post.slug}`;
    const description = escapeXml(stripMarkdown(post.body_md));
    const categories = post.tags
      .map((t) => `<category>${escapeXml(t)}</category>`)
      .join('');
    return [
      '    <item>',
      `      <title>${escapeXml(post.title)}</title>`,
      `      <link>${escapeXml(link)}</link>`,
      `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
      `      <description>${description}</description>`,
      `      <author>${escapeXml(post.author.name)}</author>`,
      `      <category>${escapeXml(post.category)}</category>`,
      categories,
      `      <pubDate>${new Date(post.published_at_iso).toUTCString()}</pubDate>`,
      '    </item>',
    ].join('\n');
  }).join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeXml(SITE_TITLE)}</title>`,
    `    <link>${escapeXml(homeUrl)}</link>`,
    `    <description>${escapeXml(SITE_DESCRIPTION)}</description>`,
    `    <language>${SITE_LANGUAGE}</language>`,
    `    <lastBuildDate>${lastBuildDate}</lastBuildDate>`,
    `    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />`,
    items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}

export function GET(): Response {
  const body = buildRssXml();
  return new Response(body, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}