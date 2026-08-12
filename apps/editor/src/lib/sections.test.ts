/**
 * Sections — Wave 2 §S2.4 unit tests.
 *
 * Verifies section templates are 3–5 slides, search filters work,
 * and `buildSlides` produces slide-group inserts ready for the engine
 * bridge.
 */

import { describe, expect, it } from 'vitest';
import {
  SECTION_TEMPLATES,
  getSectionTemplate,
  searchSections,
} from './sections';

describe('sections', () => {
  it('ships a curated catalog of 3-5 slide sections', () => {
    expect(SECTION_TEMPLATES.length).toBeGreaterThan(0);
    for (const sec of SECTION_TEMPLATES) {
      expect(sec.slideCount).toBeGreaterThanOrEqual(3);
      expect(sec.slideCount).toBeLessThanOrEqual(5);
    }
  });

  it('every section has tags and a cover', () => {
    for (const sec of SECTION_TEMPLATES) {
      expect(sec.tags.length).toBeGreaterThan(0);
      expect(sec.cover.trim().startsWith('<svg')).toBe(true);
    }
  });

  it('finds a section by id', () => {
    expect(getSectionTemplate('team')?.name).toBe('Team');
    expect(getSectionTemplate('missing')).toBeUndefined();
  });

  it('searchSections narrows by name/tag/description', () => {
    expect(searchSections('team').length).toBeGreaterThan(0);
    expect(searchSections('case study').length).toBeGreaterThan(0);
    expect(searchSections('xyzzy-no-match')).toEqual([]);
  });

  it('buildSlides produces the declared count with unique ids', () => {
    const sec = getSectionTemplate('team')!;
    const slides = sec.buildSlides({ ratioW: 16, ratioH: 9 }, 'team-base');
    expect(slides.length).toBe(sec.slideCount);
    const ids = new Set(slides.map((s) => s.id));
    expect(ids.size).toBe(slides.length);
    for (const s of slides) {
      expect(s.elements.length).toBeGreaterThan(0);
    }
  });
});