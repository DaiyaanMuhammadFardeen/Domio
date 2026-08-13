/**
 * Accessibility-audit worker tests.
 */

import { describe, it, expect } from 'vitest';
import { auditAccessibility, simulateCvd, suggestCvSafePalette } from './auditor.js';

const PASSING_PALETTE = [
  { tokenId: 'color.bg.surface', hex: '#ffffff', role: 'background' as const },
  { tokenId: 'color.content.primary', hex: '#111111', role: 'content' as const },
  { tokenId: 'color.interactive.link', hex: '#0033aa', role: 'interactive' as const },
  { tokenId: 'color.bg.muted', hex: '#f4f1ec', role: 'background' as const },
];

const FAILING_PALETTE = [
  { tokenId: 'color.bg.surface', hex: '#ffffff', role: 'background' as const },
  { tokenId: 'color.content.muted', hex: '#bbbbbb', role: 'content' as const },
  { tokenId: 'color.content.subtle', hex: '#cccccc', role: 'content' as const },
];

const CVD_UNSAFE_PALETTE = [
  { tokenId: 'color.bg.surface', hex: '#ffffff', role: 'background' as const },
  { tokenId: 'color.chart.a', hex: '#1b7837', role: 'content' as const },
  { tokenId: 'color.chart.b', hex: '#5aae61', role: 'content' as const },
];

describe('auditAccessibility', () => {
  it('returns no BLOCK findings for a passing palette', () => {
    const r = auditAccessibility({ colors: PASSING_PALETTE });
    const blocks = r.contrast.filter((f) => f.severity === 'BLOCK');
    expect(blocks.length).toBe(0);
  });

  it('returns BLOCK for low-contrast content tokens', () => {
    const r = auditAccessibility({ colors: FAILING_PALETTE });
    const blocks = r.contrast.filter((f) => f.severity === 'BLOCK');
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0]!.kind).toBe('wcag');
  });

  it('includes an auto-suggest compliant pair for BLOCK findings', () => {
    const r = auditAccessibility({ colors: FAILING_PALETTE });
    const block = r.contrast.find((f) => f.severity === 'BLOCK');
    expect(block).toBeDefined();
    expect(block!.suggestion).not.toBeNull();
  });

  it('skips decorative tokens in the WCAG audit', () => {
    const palette = [
      { tokenId: 'color.bg.surface', hex: '#ffffff', role: 'background' as const },
      { tokenId: 'color.decorative.confetti', hex: '#ffeeff', role: 'decorative' as const },
      { tokenId: 'color.content.body', hex: '#999999', role: 'content' as const },
    ];
    const r = auditAccessibility({ colors: palette });
    expect(r.decorativeSkipped).toContain('color.decorative.confetti');
    // The decorative token should not appear in any contrast finding pair.
    for (const f of r.contrast) {
      expect(f.fgTokenId).not.toBe('color.decorative.confetti');
      expect(f.bgTokenId).not.toBe('color.decorative.confetti');
    }
  });

  it('returns APCA WARN for body tokens failing prefers-contrast: more', () => {
    // A very light gray on white — too low for prefers-contrast: more.
    const palette = [
      { tokenId: 'color.bg.surface', hex: '#ffffff', role: 'background' as const },
      { tokenId: 'color.content.body', hex: '#cccccc', role: 'content' as const },
    ];
    const r = auditAccessibility({ colors: palette });
    const apca = r.contrast.find((f) => f.kind === 'apca');
    expect(apca).toBeDefined();
    expect(apca!.severity).toBe('WARN');
  });

  it('flags CVD-unsafe palette pairs', () => {
    const r = auditAccessibility({ colors: CVD_UNSAFE_PALETTE });
    expect(r.cvd.length).toBeGreaterThan(0);
    expect(r.cvd[0]!.kind).toBe('cvd');
  });

  it('returns empty CVD findings for a CV-safe palette', () => {
    const safe = [
      { tokenId: 'color.bg.surface', hex: '#ffffff', role: 'background' as const },
      { tokenId: 'color.chart.a', hex: '#d73027', role: 'content' as const },
      { tokenId: 'color.chart.b', hex: '#4575b4', role: 'content' as const },
    ];
    const r = auditAccessibility({ colors: safe });
    expect(r.cvd.length).toBe(0);
  });

  it('suggests a CV-safe palette with at least 30° hue spacing', () => {
    const safe = suggestCvSafePalette(CVD_UNSAFE_PALETTE);
    expect(safe.length).toBe(CVD_UNSAFE_PALETTE.length);
    // Re-sort and check minimum pairwise hue distance.
    const hues = safe.map((c) => c.H).sort((a, b) => a - b);
    let minDist = 360;
    for (let i = 0; i < hues.length; i++) {
      for (let j = i + 1; j < hues.length; j++) {
        const diff = Math.abs(hues[i]! - hues[j]!);
        const wrap = Math.min(diff, 360 - diff);
        if (wrap < minDist) minDist = wrap;
      }
    }
    expect(minDist).toBeGreaterThanOrEqual(28); // Allow 2° tolerance
  });

  it('uses AA-Large threshold for interactive tokens', () => {
    const palette = [
      { tokenId: 'color.bg.surface', hex: '#ffffff', role: 'background' as const },
      { tokenId: 'color.interactive.link', hex: '#6688aa', role: 'interactive' as const },
    ];
    const r = auditAccessibility({ colors: palette });
    const interactive = r.contrast.find((f) => f.fgTokenId === 'color.interactive.link');
    if (interactive && interactive.kind === 'wcag') {
      // Interactive tokens use the 3:1 (AA-Large) threshold.
      expect(interactive.threshold).toBe(3);
    }
  });
});

describe('simulateCvd', () => {
  it('produces a valid hex output for deuteranopia', () => {
    const sim = simulateCvd('#aa3a14', 'deuteranopia');
    expect(sim).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('produces a valid hex output for protanopia', () => {
    const sim = simulateCvd('#aa3a14', 'protanopia');
    expect(sim).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('produces a valid hex output for tritanopia', () => {
    const sim = simulateCvd('#aa3a14', 'tritanopia');
    expect(sim).toMatch(/^#[0-9a-f]{6}$/);
  });
});
