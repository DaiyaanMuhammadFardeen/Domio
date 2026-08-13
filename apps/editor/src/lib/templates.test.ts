/**
 * Templates — Wave 2 §S2.4 unit tests.
 *
 * Verifies the template gallery exposes a useful starting catalog,
 * search/use-case filters narrow correctly, and every template builds
 * a valid slide list for the deck's default aspect.
 */

import { describe, expect, it } from 'vitest';
import { TEMPLATES, getTemplate, searchTemplates, templatesByUseCase } from './templates';

describe('templates', () => {
  it('ships a curated starter catalog', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(5);
  });

  it('every template has a cover SVG and use-case chips', () => {
    for (const t of TEMPLATES) {
      expect(t.cover.trim().startsWith('<svg')).toBe(true);
      expect(t.useCases.length).toBeGreaterThan(0);
    }
  });

  it('finds a template by id', () => {
    expect(getTemplate('investor-pitch')?.name).toBe('Investor Pitch');
    expect(getTemplate('missing')).toBeUndefined();
  });

  it('searchTemplates narrows by name/description/useCase', () => {
    expect(searchTemplates('investor').length).toBeGreaterThan(0);
    expect(searchTemplates('xyzzy-no-match')).toEqual([]);
  });

  it('templatesByUseCase returns templates that opt in', () => {
    const pitch = templatesByUseCase('Pitch');
    expect(pitch.length).toBeGreaterThan(0);
    for (const t of pitch) {
      expect(t.useCases).toContain('Pitch');
    }
  });

  it('buildSlides returns a non-empty list of valid slides for each template', () => {
    for (const t of TEMPLATES) {
      const slides = t.buildSlides({ ratioW: 16, ratioH: 9 });
      expect(slides.length).toBeGreaterThan(0);
      for (const s of slides) {
        expect(s.id).toBeTruthy();
        expect(typeof s.position).toBe('number');
        expect(s.aspect).toEqual({ ratioW: 16, ratioH: 9 });
      }
    }
  });
});
