import { describe, it, expect } from 'vitest';
import { InMemoryStore } from '../store/memory.js';
import { defaultDeps, type ServiceDeps } from '../deps.js';
import {
  ingestIcon,
  findSimilarIcons,
  searchIcons,
  recolorIcon,
  insertIconToScene,
  countIcons,
  dhashPixelsFromPath,
} from './icons.js';

function makeDeps(overrides: Partial<ServiceDeps> = {}): ServiceDeps {
  return defaultDeps(new InMemoryStore(), overrides);
}

const SAMPLE_PATH =
  'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z';

describe('icons', () => {
  describe('ingestIcon', () => {
    it('creates an icon with computed perceptual hash', async () => {
      const deps = makeDeps();
      const icon = await ingestIcon(deps, {
        name: 'test-icon',
        pathData: SAMPLE_PATH,
        vendor: 'test',
        licenseId: 'MIT',
      });

      expect(icon.id).toBeTruthy();
      expect(icon.name).toBe('test-icon');
      expect(icon.perceptualHash).toBeTruthy();
      expect(icon.perceptualHash).toHaveLength(16);
    });

    it('rejects empty name', async () => {
      const deps = makeDeps();
      await expect(ingestIcon(deps, { name: '', pathData: SAMPLE_PATH })).rejects.toThrow(
        'Icon name is required',
      );
    });

    it('rejects empty pathData', async () => {
      const deps = makeDeps();
      await expect(ingestIcon(deps, { name: 'test', pathData: '' })).rejects.toThrow(
        'Icon pathData is required',
      );
    });

    it('allows duplicate names (no uniqueness constraint on name)', async () => {
      const deps = makeDeps();
      const a = await ingestIcon(deps, { name: 'dup', pathData: SAMPLE_PATH });
      const b = await ingestIcon(deps, { name: 'dup', pathData: SAMPLE_PATH });
      expect(a.id).not.toBe(b.id);
      expect(a.name).toBe(b.name);
    });
  });

  describe('dhashPixelsFromPath', () => {
    it('is deterministic — same input produces same hash', () => {
      const h1 = dhashPixelsFromPath(SAMPLE_PATH);
      const h2 = dhashPixelsFromPath(SAMPLE_PATH);
      expect(h1).toBe(h2);
    });

    it('produces different hashes for different paths', () => {
      const h1 = dhashPixelsFromPath(SAMPLE_PATH);
      const h2 = dhashPixelsFromPath('M0 0 L100 100 L50 0 Z');
      expect(h1).not.toBe(h2);
    });

    it('returns a 16-char hex string', () => {
      const hash = dhashPixelsFromPath(SAMPLE_PATH);
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  describe('findSimilarIcons', () => {
    it('returns icons with matching perceptual hash', async () => {
      const deps = makeDeps();
      const a = await ingestIcon(deps, { name: 'icon-a', pathData: SAMPLE_PATH });
      const b = await ingestIcon(deps, { name: 'icon-b', pathData: SAMPLE_PATH });
      const similar = await findSimilarIcons(deps, a.id);
      expect(similar.length).toBeGreaterThanOrEqual(2);
      const ids = similar.map((i) => i.id);
      expect(ids).toContain(a.id);
      expect(ids).toContain(b.id);
    });

    it('throws for non-existent icon', async () => {
      const deps = makeDeps();
      await expect(findSimilarIcons(deps, 'nonexistent')).rejects.toThrow('not found');
    });
  });

  describe('searchIcons', () => {
    it('returns results for exact name match', async () => {
      const deps = makeDeps();
      await ingestIcon(deps, {
        name: 'home-icon',
        synonyms: ['house'],
        pathData: SAMPLE_PATH,
      });
      const results = await searchIcons(deps, { q: 'home-icon' });
      expect(results.length).toBe(1);
      expect(results[0]!.name).toBe('home-icon');
    });

    it('expands synonyms — searching "pin" finds "location"', async () => {
      const deps = makeDeps();
      await ingestIcon(deps, {
        name: 'map-pin',
        synonyms: ['pin', 'location', 'marker'],
        pathData: SAMPLE_PATH,
      });
      // Searching "location" should find it through synonym expansion
      const results = await searchIcons(deps, { q: 'location' });
      expect(results.length).toBe(1);
      expect(results[0]!.name).toBe('map-pin');
    });

    it('respects limit', async () => {
      const deps = makeDeps();
      for (let i = 0; i < 5; i++) {
        await ingestIcon(deps, { name: `icon-${i}`, pathData: SAMPLE_PATH });
      }
      const results = await searchIcons(deps, { q: 'icon', limit: 2 });
      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  describe('recolorIcon', () => {
    it('replaces fill color', () => {
      const input = '<path fill="#000000" d="M0 0"/>';
      const result = recolorIcon(input, '#ff0000');
      expect(result).toBe('<path fill="#ff0000" d="M0 0"/>');
    });

    it('replaces stroke color', () => {
      const input = '<path stroke="#333333" d="M0 0"/>';
      const result = recolorIcon(input, '#00ff00');
      expect(result).toBe('<path stroke="#00ff00" d="M0 0"/>');
    });

    it('replaces both fill and stroke', () => {
      const input = '<path fill="#000000" stroke="#ffffff" d="M0 0"/>';
      const result = recolorIcon(input, '#abcdef');
      expect(result).toBe('<path fill="#abcdef" stroke="#abcdef" d="M0 0"/>');
    });

    it('does not modify unrelated attributes', () => {
      const input = '<path fill="#000000" opacity="0.5" d="M0 0"/>';
      const result = recolorIcon(input, '#ff0000');
      expect(result).toContain('opacity="0.5"');
      expect(result).toContain('fill="#ff0000"');
    });

    it('handles single-quote attributes', () => {
      const input = "<path fill='#000000' d='M0 0'/>";
      const result = recolorIcon(input, '#ff0000');
      expect(result).toContain("fill='#ff0000'");
    });

    it('replaces rgb() fill values', () => {
      const input = '<path fill="rgb(0,0,0)" d="M0 0"/>';
      const result = recolorIcon(input, '#ff0000');
      expect(result).toBe('<path fill="#ff0000" d="M0 0"/>');
    });
  });

  describe('insertIconToScene', () => {
    it('produces correct payload shape', () => {
      const payload = insertIconToScene('icon-123', 'elem-456');
      expect(payload).toEqual({
        elementId: 'elem-456',
        catalogId: 'domio.icon',
        props: {
          iconId: 'icon-123',
          color: '#000000',
          size: 24,
        },
      });
    });

    it('uses provided props', () => {
      const payload = insertIconToScene('icon-123', 'elem-456', {
        color: '#ff0000',
        size: 48,
      });
      expect(payload.props.color).toBe('#ff0000');
      expect(payload.props.size).toBe(48);
    });
  });

  describe('countIcons', () => {
    it('returns count from store', async () => {
      const deps = makeDeps();
      expect(await countIcons(deps)).toBe(0);
      await ingestIcon(deps, { name: 'a', pathData: SAMPLE_PATH });
      await ingestIcon(deps, { name: 'b', pathData: SAMPLE_PATH });
      expect(await countIcons(deps)).toBe(2);
    });
  });
});
