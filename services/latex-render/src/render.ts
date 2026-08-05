/**
 * KaTeX render pipeline for LaTeX source.
 *
 * Converts LaTeX math source to HTML using KaTeX's server-side rendering.
 * Returns structured output with cache key and metadata.
 */

import katex from 'katex';
import { createHash } from 'node:crypto';

export interface RenderOptions {
  readonly themeHash?: string;
  readonly displayMode?: boolean;
}

export interface RenderResult {
  readonly html: string;
  readonly cssUrl: string;
  readonly cache_key: string;
  readonly rendered_at: string;
}

/**
 * Render LaTeX source to HTML via KaTeX.
 *
 * @throws {RenderError} on KaTeX ParseError (status 422)
 */
export function renderLatex(source: string, options: RenderOptions = {}): RenderResult {
  const { themeHash = 'default', displayMode = false } = options;

  try {
    const html = katex.renderToString(source, {
      throwOnError: true,
      displayMode,
    });

    const rendered_at = new Date().toISOString();
    const cache_key = computeCacheKey(source, themeHash, displayMode);

    return {
      html,
      cssUrl: 'https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css',
      cache_key,
      rendered_at,
    };
  } catch (err: unknown) {
    // KaTeX throws ParseError which has a message property
    if (err && typeof err === 'object' && 'message' in err) {
      throw new RenderError(String((err as { message: unknown }).message));
    }
    throw new RenderError(String(err));
  }
}

/**
 * Compute a deterministic cache key from source + themeHash + displayMode.
 * Uses SHA-256 truncated to 32 hex chars.
 */
export function computeCacheKey(
  source: string,
  themeHash: string,
  displayMode: boolean,
): string {
  const payload = `${source}|${themeHash}|${displayMode}`;
  return createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

/**
 * Error class for render failures (422 Unprocessable).
 */
export class RenderError extends Error {
  readonly statusCode = 422;
  constructor(message: string) {
    super(message);
    this.name = 'RenderError';
  }
}
