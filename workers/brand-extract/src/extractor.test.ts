/**
 * Brand-extract worker tests.
 */

import { describe, it, expect } from 'vitest';
import { extractBrandKit, paletteTokensToTokenIds } from './extractor.js';

const SAMPLE_HTML = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>Acme — Coffee, made simple</title>
    <meta name="description" content="Roasted small batch coffee for the curious palate.">
    <meta property="og:site_name" content="Acme Coffee">
    <meta property="og:title" content="Acme Coffee">
    <meta name="theme-color" content="#33180c">
    <meta name="msapplication-TileColor" content="#ffffff">
    <link rel="icon" href="/favicon.ico">
    <meta property="og:image" content="https://cdn.acme.com/og.png">
    <style>
      body { font-family: 'Helvetica Neue', sans-serif; background: #f4f1ec; color: #33180c; }
      .hero { background-color: #aa3a14; font-family: 'Acme Sans', sans-serif; }
    </style>
  </head>
  <body>
    <h1 style="color: #aa3a14;">Welcome</h1>
    <p style="background: #f4f1ec; color: #33180c;">Hello world</p>
  </body>
</html>
`;

describe('extractBrandKit', () => {
  it('extracts attribution', () => {
    const r = extractBrandKit({ url: 'https://acme.com', html: SAMPLE_HTML });
    expect(r.attribution.siteName).toBe('Acme Coffee');
    expect(r.attribution.title).toBe('Acme — Coffee, made simple');
  });

  it('extracts logos from <link rel="icon"> and og:image', () => {
    const r = extractBrandKit({ url: 'https://acme.com', html: SAMPLE_HTML });
    expect(r.logos.length).toBeGreaterThanOrEqual(1);
    expect(r.logos.some((l) => l.url.includes('og.png'))).toBe(true);
  });

  it('extracts a palette from theme-color, inline-style, and embedded CSS', () => {
    const r = extractBrandKit({ url: 'https://acme.com', html: SAMPLE_HTML });
    expect(r.palette.length).toBeGreaterThan(0);
    const hexes = r.palette.map((p) => p.hex.toLowerCase());
    expect(hexes.length).toBeGreaterThan(0);
  });

  it('extracts fonts from embedded CSS', () => {
    const r = extractBrandKit({ url: 'https://acme.com', html: SAMPLE_HTML });
    const families = r.fonts.map((f) => f.family);
    expect(families).toContain('Helvetica Neue');
    expect(families).toContain('Acme Sans');
  });

  it('records confidence scores per category', () => {
    const r = extractBrandKit({ url: 'https://acme.com', html: SAMPLE_HTML });
    expect(r.confidenceScores.palette).toBeGreaterThan(0);
    expect(r.confidenceScores.fonts).toBeGreaterThan(0);
    expect(r.confidenceScores.logos).toBeGreaterThan(0);
  });

  it('records all stages', () => {
    const r = extractBrandKit({ url: 'https://acme.com', html: SAMPLE_HTML });
    expect(r.stages).toContain('colors');
    expect(r.stages).toContain('fonts');
    expect(r.stages).toContain('logo');
  });

  it('returns empty arrays when the HTML is empty', () => {
    const r = extractBrandKit({ url: 'https://acme.com', html: '<html></html>' });
    expect(r.palette.length).toBe(0);
    expect(r.fonts.length).toBe(0);
    expect(r.logos.length).toBe(0);
  });

  it('builds palette token IDs in the color.brand.* namespace', () => {
    const r = extractBrandKit({ url: 'https://acme.com', html: SAMPLE_HTML });
    const tokens = paletteTokensToTokenIds(r.palette);
    for (const t of tokens) {
      expect(t.tokenId.startsWith('color.brand.')).toBe(true);
    }
  });
});
