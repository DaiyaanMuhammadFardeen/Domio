/**
 * Wave 9 §S9.7 — theme-service tests.
 */

import { afterEach, describe, it, expect, vi } from 'vitest';
import { FALLBACK_THEMES, getTheme, listThemeSlugs } from './theme-service';

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

function mockFetchOnce(body: unknown, status = 200): void {
  globalThis.fetch = vi.fn(async () => {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
}

describe('theme-service', () => {
  it('returns the upstream theme when fetch succeeds', async () => {
    const upstream = {
      id: 'theme_remote',
      slug: 'remote',
      title: 'Remote Theme',
      description: 'From API',
      tokens: FALLBACK_THEMES.midnight!.tokens,
      price_cents: 999,
      currency: 'USD',
      is_free: false,
      tags: ['remote'],
    };
    mockFetchOnce(upstream);

    const result = await getTheme('remote');
    expect(result?.id).toBe('theme_remote');
    expect(result?.price_cents).toBe(999);
  });

  it('falls back to the midnight seed when the API errors', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response('boom', { status: 500 });
    }) as typeof fetch;

    const result = await getTheme('midnight');
    expect(result).not.toBeNull();
    expect(result?.slug).toBe('midnight');
    expect(result?.title).toBe('Midnight');
  });

  it('falls back for sunset / forest / paper slugs', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response('boom', { status: 500 });
    }) as typeof fetch;

    for (const slug of ['sunset', 'forest', 'paper']) {
      const r = await getTheme(slug);
      expect(r?.slug).toBe(slug);
      expect(r?.title).toBe(FALLBACK_THEMES[slug]!.title);
    }
  });

  it('returns a deterministic fallback for an unknown slug without throwing', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response('boom', { status: 500 });
    }) as typeof fetch;

    const r = await getTheme('oblivion-galaxy');
    expect(r).not.toBeNull();
    expect(r?.slug).toBe('oblivion-galaxy');
    expect(r?.title.toLowerCase()).toBe('oblivion-galaxy');
    expect(r?.tokens.color.bg).toBeTruthy();
  });

  it('listThemeSlugs falls back to the seed keys when fetch fails', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response('boom', { status: 500 });
    }) as typeof fetch;

    const slugs = await listThemeSlugs();
    expect(slugs).toContain('midnight');
    expect(slugs).toContain('sunset');
    expect(slugs).toContain('forest');
    expect(slugs).toContain('paper');
  });

  it('listThemeSlugs returns slugs from the API when available', async () => {
    mockFetchOnce({ items: [{ slug: 'alpha' }, { slug: 'beta' }] });
    const slugs = await listThemeSlugs();
    expect(slugs).toEqual(['alpha', 'beta']);
  });

  it('FALLBACK_THEMES has 4 entries', () => {
    expect(Object.keys(FALLBACK_THEMES)).toHaveLength(4);
  });
});
