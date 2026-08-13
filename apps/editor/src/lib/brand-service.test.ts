/**
 * brand-service — Wave 2 §S2.5 unit tests.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  DEFAULT_BRAND_KITS,
  DEFAULT_THEMES,
  extractBrandFromUrl,
  fetchBrandKit,
  fetchBrandKits,
  fetchTheme,
  fetchThemes,
  generateDarkTheme,
  lintStyle,
} from './brand-service';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('brand-service', () => {
  it('fetchBrandKits returns the bootstrap defaults when no backend is reachable', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const kits = await fetchBrandKits('http://localhost:0');
    expect(kits.length).toBeGreaterThan(0);
    expect(kits[0]?.id).toBe('brand-acme');
  });

  it('fetchBrandKits returns the bootstrap defaults when the backend returns an empty array', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as unknown as typeof fetch;
    const kits = await fetchBrandKits('http://localhost:0');
    expect(kits).toEqual(DEFAULT_BRAND_KITS);
  });

  it('fetchBrandKits returns the backend payload when reachable', async () => {
    const remote = [
      {
        id: 'remote-1',
        name: 'Remote',
        primaryHex: '#000',
        accentHex: '#fff',
        colors: [],
        typography: [],
        spacing: [],
        radius: [],
        shadows: [],
      },
    ];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => remote,
    }) as unknown as typeof fetch;
    const kits = await fetchBrandKits('http://localhost:0');
    expect(kits).toEqual(remote);
  });

  it('fetchBrandKit returns null for an unknown id', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const kit = await fetchBrandKit('does-not-exist', 'http://localhost:0');
    expect(kit).toBeNull();
  });

  it('fetchTheme returns the bootstrap when the backend is unreachable', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const theme = await fetchTheme('theme-acme-light', 'http://localhost:0');
    expect(theme?.id).toBe('theme-acme-light');
  });

  it('fetchThemes returns the bootstrap defaults on network failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const themes = await fetchThemes('http://localhost:0');
    expect(themes).toEqual(DEFAULT_THEMES);
  });

  it('extractBrandFromUrl returns a deterministic bootstrap based on URL', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const a = await extractBrandFromUrl('https://example.com', 'http://localhost:0');
    const b = await extractBrandFromUrl('https://example.com', 'http://localhost:0');
    expect(a).toEqual(b);
    expect(a.primaryHex).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(a.accentHex).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(a.fontFamilies.length).toBe(3);
    expect(a.suggestedKitName).toContain('Example');
  });

  it('extractBrandFromUrl returns backend payload when reachable', async () => {
    const remote = {
      sourceUrl: 'https://a.com',
      primaryHex: '#abc123',
      accentHex: '#def456',
      secondaryHexes: ['#000'],
      fontFamilies: ['Inter'],
      suggestedKitName: 'A Kit',
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => remote,
    }) as unknown as typeof fetch;
    const out = await extractBrandFromUrl('https://a.com', 'http://localhost:0');
    expect(out).toEqual(remote);
  });

  it('extractBrandFromUrl falls back when URL parsing fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const out = await extractBrandFromUrl('not-a-url', 'http://localhost:0');
    expect(out.suggestedKitName).toBe('Brand Kit');
  });

  it('generateDarkTheme returns a dark variant of the light theme', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const out = await generateDarkTheme('theme-acme-light', 'http://localhost:0');
    expect(out.scheme).toBe('dark');
    expect(out.isDark).toBe(true);
    expect(out.tokens['color.bg']).toBe('#0a0e14');
    expect(out.tokens['color.fg']).toBe('#e6edf3');
  });

  it('generateDarkTheme returns the backend payload when reachable', async () => {
    const remote = {
      id: 'remote-dark',
      name: 'Remote Dark',
      scheme: 'dark' as const,
      isDark: true,
      tokens: { 'color.bg': '#000' },
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => remote,
    }) as unknown as typeof fetch;
    const out = await generateDarkTheme('theme-acme-light', 'http://localhost:0');
    expect(out).toEqual(remote);
  });

  it('lintStyle returns an empty report when offline + no elements', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const report = await lintStyle('brand-acme', [], 'http://localhost:0');
    expect(report.issues.length).toBe(0);
    expect(report.scannedElementCount).toBe(0);
  });

  it('lintStyle flags elements with off-brand fill', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const report = await lintStyle(
      'brand-acme',
      [
        { id: 'el-1', name: 'Shape', fill: '#ff0000' },
        { id: 'el-2', name: 'Logo', fill: '#33180c' },
      ],
      'http://localhost:0',
    );
    expect(report.issues.length).toBe(1);
    expect(report.issues[0]?.elementId).toBe('el-1');
    expect(report.issues[0]?.tokenId).toBe('color.brand.primary');
    expect(report.issues[0]?.severity).toBe('warning');
  });

  it('lintStyle uses the backend when available', async () => {
    const remote = {
      brandKitId: 'brand-acme',
      issues: [
        {
          elementId: 'el-1',
          elementName: 'Shape',
          property: 'fill',
          currentValue: '#fff',
          expectedValue: '#000',
          tokenId: 'color.brand.primary',
          severity: 'error' as const,
        },
      ],
      scannedElementCount: 5,
      scannedAtMs: 1234,
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => remote,
    }) as unknown as typeof fetch;
    const report = await lintStyle(
      'brand-acme',
      [{ id: 'el-1', name: 'Shape' }],
      'http://localhost:0',
    );
    expect(report.issues.length).toBe(1);
    expect(report.issues[0]?.severity).toBe('error');
  });
});
