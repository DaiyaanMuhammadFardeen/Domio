/**
 * PostClient — renders the body of a single blog post.
 *
 * Wave 12 §S12.10 — Blog. We do not pull in a full MDX runtime; this
 * component renders a tiny subset of markdown (paragraphs, `##`
 * headings, inline `code`, bullet lists, and blockquotes marked with
 * `>`) so the landing app stays dependency-free. The body content is
 * authored as plain strings in `lib/blog-data`.
 */

'use client';

import type { JSX, ReactNode } from 'react';

export interface PostClientProps {
  readonly body_md: string;
}

interface Block {
  readonly kind: 'h2' | 'ul' | 'p' | 'quote';
  readonly text: string;
  readonly items?: ReadonlyArray<string>;
}

/**
 * Minimal markdown → block list. Supports:
 *   ## Heading
 *   - bullet
 *   - bullet
 *   > quote line
 *   plain paragraph
 */
function parseBody(md: string): ReadonlyArray<Block> {
  const lines = md.split(/\r?\n/);
  const blocks: Block[] = [];
  let paragraphBuffer: string[] = [];
  let listBuffer: string[] = [];
  let quoteBuffer: string[] = [];

  const flushParagraph = (): void => {
    if (paragraphBuffer.length > 0) {
      blocks.push({ kind: 'p', text: paragraphBuffer.join(' ').trim() });
      paragraphBuffer = [];
    }
  };
  const flushList = (): void => {
    if (listBuffer.length > 0) {
      blocks.push({ kind: 'ul', text: '', items: listBuffer });
      listBuffer = [];
    }
  };
  const flushQuote = (): void => {
    if (quoteBuffer.length > 0) {
      blocks.push({ kind: 'quote', text: quoteBuffer.join(' ').trim() });
      quoteBuffer = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === '') {
      flushParagraph();
      flushList();
      flushQuote();
      continue;
    }
    if (line.startsWith('## ')) {
      flushParagraph();
      flushList();
      flushQuote();
      blocks.push({ kind: 'h2', text: line.slice(3).trim() });
      continue;
    }
    if (line.startsWith('- ')) {
      flushParagraph();
      flushQuote();
      listBuffer.push(line.slice(2).trim());
      continue;
    }
    if (line.startsWith('> ')) {
      flushParagraph();
      flushList();
      quoteBuffer.push(line.slice(2).trim());
      continue;
    }
    flushList();
    flushQuote();
    paragraphBuffer.push(line.trim());
  }

  flushParagraph();
  flushList();
  flushQuote();

  return blocks;
}

/**
 * Inline `code` and emphasis pass. Kept intentionally simple.
 */
function renderInline(text: string): ReactNode {
  const parts: ReactNode[] = [];
  const re = /`([^`]+)`/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(<code key={`c-${i++}`}>{match[1]}</code>);
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

export function PostClient({ body_md }: PostClientProps): JSX.Element {
  const blocks = parseBody(body_md);

  return (
    <div className="blog-post__body" data-testid="blog-post-body">
      {blocks.map((block, idx) => {
        switch (block.kind) {
          case 'h2':
            return (
              <h2 key={idx} className="blog-post__h2">
                {renderInline(block.text)}
              </h2>
            );
          case 'ul':
            return (
              <ul key={idx} className="blog-post__list">
                {(block.items ?? []).map((item, j) => (
                  <li key={j}>{renderInline(item)}</li>
                ))}
              </ul>
            );
          case 'quote':
            return (
              <blockquote key={idx} className="blog-post__quote">
                {renderInline(block.text)}
              </blockquote>
            );
          case 'p':
          default:
            return (
              <p key={idx} className="blog-post__p">
                {renderInline(block.text)}
              </p>
            );
        }
      })}
    </div>
  );
}

export default PostClient;
