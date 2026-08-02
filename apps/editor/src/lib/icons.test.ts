/**
 * Tests for icons.ts — search, tag matching, and full icon set validation.
 */

import { describe, it, expect } from 'vitest';
import { ICONS, searchIcons, getIcon } from './icons';

describe('ICONS', () => {
  it('ships at least 30 icons', () => {
    expect(ICONS.length).toBeGreaterThanOrEqual(30);
  });

  it('each icon has required fields', () => {
    for (const icon of ICONS) {
      expect(icon.id).toBeTruthy();
      expect(icon.name).toBeTruthy();
      expect(icon.pathData).toBeTruthy();
      expect(icon.tags.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate ids', () => {
    const ids = ICONS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('getIcon', () => {
  it('returns an icon by id', () => {
    const icon = getIcon('star');
    expect(icon).toBeDefined();
    expect(icon?.name).toBe('Star');
  });

  it('returns undefined for unknown id', () => {
    expect(getIcon('nonexistent')).toBeUndefined();
  });
});

describe('searchIcons', () => {
  it('returns all icons for empty query', () => {
    expect(searchIcons('')).toHaveLength(ICONS.length);
  });

  it('searches by name', () => {
    const results = searchIcons('arrow');
    expect(results.length).toBeGreaterThanOrEqual(3);
    expect(results.every((i) => i.name.toLowerCase().includes('arrow'))).toBe(true);
  });

  it('searches by tag', () => {
    const results = searchIcons('heart');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((i) => i.id === 'heart')).toBe(true);
  });

  it('searches by id', () => {
    const results = searchIcons('zap');
    expect(results.some((i) => i.id === 'zap')).toBe(true);
  });

  it('is case-insensitive', () => {
    const lower = searchIcons('star');
    const upper = searchIcons('STAR');
    expect(lower.length).toBe(upper.length);
  });

  it('returns empty for no match', () => {
    const results = searchIcons('zzz-nonexistent-zzz');
    expect(results).toHaveLength(0);
  });
});
