/**
 * LaTeX render service — comprehensive tests (Phase 11).
 *
 * Coverage:
 *   - Safe-subset gate: all forbidden commands rejected; benign math accepted.
 *   - Render pipeline: valid math → HTML with markup; parse error → 422.
 *   - Cache: hit returns same HTML; TTL expiry via injectable clock.
 *   - Routes: POST /v1/latex/render for html/svg/png; GET /v1/latex/render/:cache_key.
 *   - Deterministic cache_key.
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { validateSafeSubset, findForbiddenCommand } from './safesubset.js';
import { renderLatex, computeCacheKey, RenderError } from './render.js';
import { RenderCache } from './cache.js';
import { createLatexRoutes } from './routes.js';

// =========================================================================
// Safe-subset gate
// =========================================================================

describe('safe-subset gate — forbidden commands', () => {
  const forbidden = [
    '\\input{foo}',
    '\\include{bar}',
    '\\href{http://x.com}{click}',
    '\\url{http://x.com}',
    '\\write18{rm -rf /}',
    '\\read',
    '\\newwrite\\myout',
    '\\openout\\myout=file.txt',
    '\\closeout\\myout',
    '\\special{dvips}',
    '\\immediate\\write18{cmd}',
  ];

  for (const cmd of forbidden) {
    it(`rejects: ${cmd}`, () => {
      const result = validateSafeSubset(cmd);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toMatch(/^Command not allowed in LaTeX subset:/);
      }
    });
  }

  it('rejects case-insensitive \\INPUT', () => {
    const result = validateSafeSubset('\\INPUT{secret}');
    expect(result.ok).toBe(false);
  });

  it('rejects \\input followed by non-alpha (end of string)', () => {
    const result = validateSafeSubset('\\input');
    expect(result.ok).toBe(false);
  });

  it('rejects \\input inside $-embedded macro', () => {
    // e.g. $\input{file}$ — the \input is still forbidden
    const result = validateSafeSubset('$\\input{file}$');
    expect(result.ok).toBe(false);
  });

  it('findForbiddenCommand returns the command name', () => {
    const cmd = findForbiddenCommand('\\href{http://evil.com}{click}');
    expect(cmd).toBe('href');
  });

  it('findForbiddenCommand returns null for safe source', () => {
    const cmd = findForbiddenCommand('\\frac{a}{b}');
    expect(cmd).toBeNull();
  });
});

describe('safe-subset gate — benign math accepted', () => {
  const safe = [
    '\\frac{a}{b}',
    '\\sum_{i=1}^n',
    '\\begin{matrix} a & b \\\\ c & d \\end{matrix}',
    '\\int_0^1 x^2 \\, dx',
    '\\nabla \\cdot E = \\frac{\\rho}{\\epsilon_0}',
    '\\alpha + \\beta = \\gamma',
    '\\sqrt{x^2 + y^2}',
    '\\lim_{x \\to 0} \\frac{\\sin x}{x}',
  ];

  for (const src of safe) {
    it(`accepts: ${src}`, () => {
      const result = validateSafeSubset(src);
      expect(result.ok).toBe(true);
    });
  }
});

// =========================================================================
// Render pipeline
// =========================================================================

describe('renderLatex', () => {
  it('renders valid math to HTML', () => {
    const result = renderLatex('\\frac{a}{b}');
    expect(result.html).toContain('katex');
    expect(result.html).toContain('mathml');
    expect(result.cache_key).toHaveLength(32);
    expect(result.rendered_at).toBeDefined();
    expect(result.cssUrl).toContain('katex');
  });

  it('renders displayMode math', () => {
    const result = renderLatex('\\sum_{i=1}^n i^2', { displayMode: true });
    expect(result.html).toContain('katex-display');
  });

  it('throws RenderError (422) on parse error', () => {
    expect(() => renderLatex('\\invalidCommand{')).toThrow(RenderError);
    try {
      renderLatex('\\invalidCommand{');
    } catch (err) {
      expect(err).toBeInstanceOf(RenderError);
      expect((err as RenderError).statusCode).toBe(422);
    }
  });

  it('cache_key is deterministic', () => {
    const a = computeCacheKey('x^2', 'theme1', false);
    const b = computeCacheKey('x^2', 'theme1', false);
    expect(a).toBe(b);
  });

  it('cache_key changes with different themeHash', () => {
    const a = computeCacheKey('x^2', 'theme1', false);
    const b = computeCacheKey('x^2', 'theme2', false);
    expect(a).not.toBe(b);
  });

  it('cache_key changes with different source', () => {
    const a = computeCacheKey('x^2', 'theme1', false);
    const b = computeCacheKey('y^2', 'theme1', false);
    expect(a).not.toBe(b);
  });

  it('cache_key changes with different displayMode', () => {
    const a = computeCacheKey('x^2', 'theme1', false);
    const b = computeCacheKey('x^2', 'theme1', true);
    expect(a).not.toBe(b);
  });
});

// =========================================================================
// Render cache
// =========================================================================

describe('RenderCache', () => {
  it('stores and retrieves a cached entry', () => {
    const cache = new RenderCache();
    const now = new Date('2025-06-01T00:00:00Z').getTime();
    cache.set('key1', '<html>test</html>', '2025-06-01T00:00:00Z');
    // Override clock for get
    const cacheWithClock = new RenderCache({ now: () => now });
    cacheWithClock.set('key1', '<html>test</html>', '2025-06-01T00:00:00Z');
    const entry = cacheWithClock.get('key1');
    expect(entry).not.toBeNull();
    expect(entry!.html).toBe('<html>test</html>');
    expect(entry!.rendered_at).toBe('2025-06-01T00:00:00Z');
  });

  it('returns null for missing key', () => {
    const cache = new RenderCache();
    expect(cache.get('nonexistent')).toBeNull();
  });

  it('returns null for expired entry (TTL)', () => {
    const epoch = new Date('2025-01-01T00:00:00Z').getTime();
    let currentTime = epoch;
    const cache = new RenderCache({
      now: () => currentTime,
      ttlMs: 1000, // 1 second TTL
    });
    cache.set('key1', '<html>', '2025-01-01T00:00:00Z');

    // Still fresh at epoch + 500ms
    currentTime = epoch + 500;
    expect(cache.get('key1')).not.toBeNull();

    // Expired at epoch + 2000ms (past 1s TTL)
    currentTime = epoch + 2000;
    expect(cache.get('key1')).toBeNull();
  });

  it('defaults to 30-day TTL', () => {
    const epoch = new Date('2025-01-01T00:00:00Z').getTime();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const cache = new RenderCache({
      now: () => epoch,
    });
    cache.set('key1', '<html>', '2025-01-01T00:00:00Z');

    // Just under 30 days — should be fresh
    const cache2 = new RenderCache({
      now: () => epoch + thirtyDaysMs - 1000,
    });
    cache2.set('key1', '<html>', '2025-01-01T00:00:00Z');
    expect(cache2.get('key1')).not.toBeNull();
  });

  it('clear() removes all entries', () => {
    const cache = new RenderCache();
    cache.set('a', '<a>', new Date().toISOString());
    cache.set('b', '<b>', new Date().toISOString());
    cache.clear();
    expect(cache.size).toBe(0);
  });
});

// =========================================================================
// Hono routes — POST /v1/latex/render
// =========================================================================

describe('routes — POST /v1/latex/render', () => {
  function makeApp() {
    const cache = new RenderCache();
    const app = new Hono();
    app.route('/', createLatexRoutes({ cache }));
    return { app, cache };
  }

  it('renders valid LaTeX to HTML', async () => {
    const { app } = makeApp();
    const res = await app.request('/v1/latex/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: '\\frac{a}{b}', format: 'html' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { rendered: string; cacheKey: string };
    expect(body.rendered).toContain('katex');
    expect(body.cacheKey).toHaveLength(32);
  });

  it('returns 400 for missing source', async () => {
    const { app } = makeApp();
    const res = await app.request('/v1/latex/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: 'html' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { code: string };
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for empty source', async () => {
    const { app } = makeApp();
    const res = await app.request('/v1/latex/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: '', format: 'html' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid format', async () => {
    const { app } = makeApp();
    const res = await app.request('/v1/latex/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'x^2', format: 'pdf' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns unsupported for png format', async () => {
    const { app } = makeApp();
    const res = await app.request('/v1/latex/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'x^2', format: 'png' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { unsupported: boolean; message: string };
    expect(body.unsupported).toBe(true);
    expect(body.message).toContain('PNG');
  });

  it('returns unsupported for svg format', async () => {
    const { app } = makeApp();
    const res = await app.request('/v1/latex/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'x^2', format: 'svg' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { unsupported: boolean; message: string };
    expect(body.unsupported).toBe(true);
    expect(body.message).toContain('SVG');
  });

  it('returns 400 for forbidden command', async () => {
    const { app } = makeApp();
    const res = await app.request('/v1/latex/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: '\\input{secret}', format: 'html' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('not allowed');
  });

  it('returns 422 for KaTeX parse error', async () => {
    const { app } = makeApp();
    const res = await app.request('/v1/latex/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: '\\invalidCommand{', format: 'html' }),
    });
    expect(res.status).toBe(422);
    const body = await res.json() as { error: string };
    expect(body.error).toBeDefined();
  });

  it('returns 400 for source exceeding 8192 chars', async () => {
    const { app } = makeApp();
    const longSource = 'x'.repeat(8193);
    const res = await app.request('/v1/latex/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: longSource, format: 'html' }),
    });
    expect(res.status).toBe(400);
  });

  it('caches the result for later retrieval', async () => {
    const { app, cache } = makeApp();
    const res = await app.request('/v1/latex/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'E=mc^2', format: 'html' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { rendered: string; cacheKey: string };
    // Verify cache has the entry
    const entry = cache.get(body.cacheKey);
    expect(entry).not.toBeNull();
    expect(entry!.html).toBe(body.rendered);
  });
});

// =========================================================================
// Hono routes — GET /v1/latex/render/:cache_key
// =========================================================================

describe('routes — GET /v1/latex/render/:cache_key', () => {
  function makeApp() {
    const cache = new RenderCache();
    const app = new Hono();
    app.route('/', createLatexRoutes({ cache }));
    return { app, cache };
  }

  it('returns cached HTML on cache hit', async () => {
    const { app } = makeApp();
    // First, render to populate cache
    const postRes = await app.request('/v1/latex/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'x^2', format: 'html' }),
    });
    const postBody = await postRes.json() as { rendered: string; cacheKey: string };

    // Then, retrieve by cache key
    const getRes = await app.request(`/v1/latex/render/${postBody.cacheKey}`);
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json() as { rendered: string; cacheKey: string };
    expect(getBody.rendered).toBe(postBody.rendered);
    expect(getBody.cacheKey).toBe(postBody.cacheKey);
  });

  it('returns 404 for unknown cache key', async () => {
    const { app } = makeApp();
    const res = await app.request('/v1/latex/render/unknownkey1234567890');
    expect(res.status).toBe(404);
  });

  it('returns 404 for expired cache entry', async () => {
    const epoch = new Date('2025-01-01T00:00:00Z').getTime();
    // Use a cache with 1s TTL and clock at epoch
    const cache = new RenderCache({
      now: () => epoch,
      ttlMs: 1000,
    });
    const app = new Hono();
    app.route('/', createLatexRoutes({ cache }));

    // Render to populate cache
    const postRes = await app.request('/v1/latex/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'y^2', format: 'html' }),
    });
    const postBody = await postRes.json() as { cacheKey: string };

    // Create a new app with a clock past TTL — entries will be expired
    const expiredCache = new RenderCache({
      now: () => epoch + 5000,
      ttlMs: 1000,
    });
    const expiredApp = new Hono();
    expiredApp.route('/', createLatexRoutes({ cache: expiredCache }));

    const getRes = await expiredApp.request(`/v1/latex/render/${postBody.cacheKey}`);
    expect(getRes.status).toBe(404);
  });
});

// =========================================================================
// Deterministic cache_key
// =========================================================================

describe('deterministic cache_key', () => {
  it('same inputs produce same key', () => {
    const k1 = computeCacheKey('\\frac{a}{b}', 'abc', false);
    const k2 = computeCacheKey('\\frac{a}{b}', 'abc', false);
    expect(k1).toBe(k2);
  });

  it('different source produces different key', () => {
    const k1 = computeCacheKey('\\frac{a}{b}', 'abc', false);
    const k2 = computeCacheKey('\\frac{x}{y}', 'abc', false);
    expect(k1).not.toBe(k2);
  });

  it('different themeHash produces different key', () => {
    const k1 = computeCacheKey('\\frac{a}{b}', 'abc', false);
    const k2 = computeCacheKey('\\frac{a}{b}', 'xyz', false);
    expect(k1).not.toBe(k2);
  });

  it('different displayMode produces different key', () => {
    const k1 = computeCacheKey('\\frac{a}{b}', 'abc', false);
    const k2 = computeCacheKey('\\frac{a}{b}', 'abc', true);
    expect(k1).not.toBe(k2);
  });

  it('key is 32 hex characters', () => {
    const key = computeCacheKey('test', 'default', false);
    expect(key).toHaveLength(32);
    expect(/^[0-9a-f]{32}$/.test(key)).toBe(true);
  });
});
