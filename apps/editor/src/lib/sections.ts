/**
 * Section templates — multi-slide insertions for the Insert panel.
 *
 * Per Wave 2 §S2.4 of docs/frontend-roadmap/02-wave-editor-surface.md.
 *
 * A section is a slide-group (3–5 slides) that inserts into the
 * active deck as one batch. Each section has a thumbnail + tag list,
 * plus a `buildSlides` factory that returns the slides to insert.
 *
 * Insertion order: appended after the current active slide.
 */

import type { Slide, AspectRatio, Element } from '@domio/schema';
import { asULID } from '@domio/schema';

export interface SectionTemplate {
  id: string;
  name: string;
  description: string;
  /** Slide count produced by `buildSlides` — between 3 and 5. */
  slideCount: number;
  cover: string;
  tags: readonly string[];
  buildSlides: (aspect: AspectRatio, baseId: string) => Slide[];
}

function makeText(opts: {
  id: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}): Element {
  return {
    id: asULID(opts.id),
    semanticId: opts.id,
    type: 'text',
    name: opts.text,
    parentId: null,
    transform: { x: opts.x, y: opts.y, w: opts.w, h: opts.h, rotation: 0 },
    text: { content: opts.text },
  };
}

function makeSlide(
  id: string,
  position: number,
  aspect: AspectRatio,
  elements: Element[],
  title?: string,
): Slide {
  return {
    id: asULID(id),
    semanticId: id,
    position,
    aspect,
    elements,
    ...(title !== undefined ? { title } : {}),
  };
}

// ---------------------------------------------------------------------------
// 1. Team — 3 slides.
// ---------------------------------------------------------------------------

const teamSection: SectionTemplate = {
  id: 'team',
  name: 'Team',
  description: 'Introduce the team: org, leadership, members.',
  slideCount: 3,
  tags: ['about', 'company'],
  cover: `
    <svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="200" fill="#f5f7fb"/>
      <circle cx="100" cy="80" r="22" fill="#5b73ff"/>
      <circle cx="160" cy="80" r="22" fill="#7d8cff"/>
      <circle cx="220" cy="80" r="22" fill="#a4aeff"/>
      <rect x="80" y="120" width="160" height="40" rx="6" fill="#eef1f8"/>
      <text x="160" y="146" text-anchor="middle" font-family="Inter,sans-serif" font-size="14" font-weight="600" fill="#0b1220">The team</text>
    </svg>
  `,
  buildSlides: (aspect, baseId) => {
    return [
      makeSlide(
        `${baseId}-team-1`,
        0,
        aspect,
        [
          makeText({ id: `${baseId}-team-1-eyebrow`, text: 'TEAM', x: 120, y: 100, w: 600, h: 30 }),
          makeText({
            id: `${baseId}-team-1-title`,
            text: 'Who we are',
            x: 120,
            y: 140,
            w: 1300,
            h: 80,
          }),
        ],
        'Team · Overview',
      ),
      makeSlide(
        `${baseId}-team-2`,
        1,
        aspect,
        [
          makeText({
            id: `${baseId}-team-2-title`,
            text: 'Leadership',
            x: 120,
            y: 100,
            w: 1300,
            h: 80,
          }),
        ],
        'Team · Leadership',
      ),
      makeSlide(
        `${baseId}-team-3`,
        2,
        aspect,
        [
          makeText({
            id: `${baseId}-team-3-title`,
            text: 'Members',
            x: 120,
            y: 100,
            w: 1300,
            h: 80,
          }),
        ],
        'Team · Members',
      ),
    ];
  },
};

// ---------------------------------------------------------------------------
// 2. Financials — 4 slides.
// ---------------------------------------------------------------------------

const financialsSection: SectionTemplate = {
  id: 'financials',
  name: 'Financials',
  description: 'P&L, revenue mix, runway, projections.',
  slideCount: 4,
  tags: ['numbers', 'board'],
  cover: `
    <svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="200" fill="#f5f7fb"/>
      <rect x="40" y="60" width="240" height="120" rx="8" fill="#fff" stroke="#dde3ee"/>
      <polyline points="60,160 90,140 120,130 150,110 180,90 210,80 240,60 260,70" stroke="#5b73ff" stroke-width="3" fill="none"/>
      <rect x="60" y="50" width="60" height="6" rx="3" fill="#5b73ff"/>
      <rect x="60" y="62" width="40" height="6" rx="3" fill="#dde3ee"/>
    </svg>
  `,
  buildSlides: (aspect, baseId) => {
    return [
      makeSlide(
        `${baseId}-fin-1`,
        0,
        aspect,
        [
          makeText({
            id: `${baseId}-fin-1-title`,
            text: 'Financials',
            x: 120,
            y: 100,
            w: 1300,
            h: 80,
          }),
        ],
        'Financials · Cover',
      ),
      makeSlide(
        `${baseId}-fin-2`,
        1,
        aspect,
        [
          makeText({
            id: `${baseId}-fin-2-title`,
            text: 'P&L summary',
            x: 120,
            y: 100,
            w: 1300,
            h: 80,
          }),
        ],
        'Financials · P&L',
      ),
      makeSlide(
        `${baseId}-fin-3`,
        2,
        aspect,
        [
          makeText({
            id: `${baseId}-fin-3-title`,
            text: 'Revenue mix',
            x: 120,
            y: 100,
            w: 1300,
            h: 80,
          }),
        ],
        'Financials · Mix',
      ),
      makeSlide(
        `${baseId}-fin-4`,
        3,
        aspect,
        [makeText({ id: `${baseId}-fin-4-title`, text: 'Runway', x: 120, y: 100, w: 1300, h: 80 })],
        'Financials · Runway',
      ),
    ];
  },
};

// ---------------------------------------------------------------------------
// 3. Roadmap — 3 slides.
// ---------------------------------------------------------------------------

const roadmapSection: SectionTemplate = {
  id: 'roadmap',
  name: 'Roadmap',
  description: 'Quarter-by-quarter product roadmap.',
  slideCount: 3,
  tags: ['product', 'planning'],
  cover: `
    <svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="200" fill="#f5f7fb"/>
      <rect x="40" y="60" width="240" height="40" rx="6" fill="#5b73ff" opacity="0.3"/>
      <rect x="40" y="110" width="240" height="40" rx="6" fill="#5b73ff" opacity="0.6"/>
      <rect x="40" y="160" width="240" height="20" rx="6" fill="#5b73ff"/>
    </svg>
  `,
  buildSlides: (aspect, baseId) => {
    return [
      makeSlide(
        `${baseId}-rm-1`,
        0,
        aspect,
        [makeText({ id: `${baseId}-rm-1-title`, text: 'Q1', x: 120, y: 100, w: 1300, h: 80 })],
        'Roadmap · Q1',
      ),
      makeSlide(
        `${baseId}-rm-2`,
        1,
        aspect,
        [makeText({ id: `${baseId}-rm-2-title`, text: 'Q2', x: 120, y: 100, w: 1300, h: 80 })],
        'Roadmap · Q2',
      ),
      makeSlide(
        `${baseId}-rm-3`,
        2,
        aspect,
        [makeText({ id: `${baseId}-rm-3-title`, text: 'Q3', x: 120, y: 100, w: 1300, h: 80 })],
        'Roadmap · Q3',
      ),
    ];
  },
};

// ---------------------------------------------------------------------------
// 4. Customer Stories — 5 slides.
// ---------------------------------------------------------------------------

const storiesSection: SectionTemplate = {
  id: 'stories',
  name: 'Customer Stories',
  description: 'Five-slide case study: intro, problem, solution, results, quote.',
  slideCount: 5,
  tags: ['case study', 'sales'],
  cover: `
    <svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="200" fill="#f5f7fb"/>
      <rect x="60" y="60" width="200" height="80" rx="8" fill="#fff" stroke="#dde3ee"/>
      <text x="80" y="100" font-family="Inter,sans-serif" font-size="20" font-weight="700" fill="#5b73ff">&ldquo;</text>
      <rect x="80" y="108" width="160" height="6" rx="3" fill="#dde3ee"/>
      <rect x="80" y="122" width="120" height="6" rx="3" fill="#dde3ee"/>
    </svg>
  `,
  buildSlides: (aspect, baseId) => {
    return [
      makeSlide(
        `${baseId}-cs-1`,
        0,
        aspect,
        [
          makeText({
            id: `${baseId}-cs-1-title`,
            text: 'Customer story',
            x: 120,
            y: 100,
            w: 1300,
            h: 80,
          }),
        ],
        'Case study · Intro',
      ),
      makeSlide(
        `${baseId}-cs-2`,
        1,
        aspect,
        [
          makeText({
            id: `${baseId}-cs-2-title`,
            text: 'The challenge',
            x: 120,
            y: 100,
            w: 1300,
            h: 80,
          }),
        ],
        'Case study · Challenge',
      ),
      makeSlide(
        `${baseId}-cs-3`,
        2,
        aspect,
        [
          makeText({
            id: `${baseId}-cs-3-title`,
            text: 'Our approach',
            x: 120,
            y: 100,
            w: 1300,
            h: 80,
          }),
        ],
        'Case study · Approach',
      ),
      makeSlide(
        `${baseId}-cs-4`,
        3,
        aspect,
        [makeText({ id: `${baseId}-cs-4-title`, text: 'Results', x: 120, y: 100, w: 1300, h: 80 })],
        'Case study · Results',
      ),
      makeSlide(
        `${baseId}-cs-5`,
        4,
        aspect,
        [
          makeText({
            id: `${baseId}-cs-5-title`,
            text: 'In their words',
            x: 120,
            y: 100,
            w: 1300,
            h: 80,
          }),
        ],
        'Case study · Quote',
      ),
    ];
  },
};

// ---------------------------------------------------------------------------
// 5. Appendix — 3 slides.
// ---------------------------------------------------------------------------

const appendixSection: SectionTemplate = {
  id: 'appendix',
  name: 'Appendix',
  description: 'Reference materials, glossary, contact.',
  slideCount: 3,
  tags: ['reference'],
  cover: `
    <svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="200" fill="#f5f7fb"/>
      <rect x="100" y="40" width="120" height="140" rx="6" fill="#fff" stroke="#dde3ee"/>
      <rect x="116" y="60" width="80" height="6" rx="3" fill="#5b73ff"/>
      <rect x="116" y="76" width="60" height="6" rx="3" fill="#dde3ee"/>
      <rect x="116" y="92" width="70" height="6" rx="3" fill="#dde3ee"/>
      <rect x="116" y="108" width="50" height="6" rx="3" fill="#dde3ee"/>
    </svg>
  `,
  buildSlides: (aspect, baseId) => {
    return [
      makeSlide(
        `${baseId}-ap-1`,
        0,
        aspect,
        [
          makeText({
            id: `${baseId}-ap-1-title`,
            text: 'Appendix',
            x: 120,
            y: 100,
            w: 1300,
            h: 80,
          }),
        ],
        'Appendix · Cover',
      ),
      makeSlide(
        `${baseId}-ap-2`,
        1,
        aspect,
        [
          makeText({
            id: `${baseId}-ap-2-title`,
            text: 'Glossary',
            x: 120,
            y: 100,
            w: 1300,
            h: 80,
          }),
        ],
        'Appendix · Glossary',
      ),
      makeSlide(
        `${baseId}-ap-3`,
        2,
        aspect,
        [makeText({ id: `${baseId}-ap-3-title`, text: 'Contact', x: 120, y: 100, w: 1300, h: 80 })],
        'Appendix · Contact',
      ),
    ];
  },
};

export const SECTION_TEMPLATES: readonly SectionTemplate[] = [
  teamSection,
  financialsSection,
  roadmapSection,
  storiesSection,
  appendixSection,
];

export function getSectionTemplate(id: string): SectionTemplate | undefined {
  return SECTION_TEMPLATES.find((s) => s.id === id);
}

export function searchSections(query: string): readonly SectionTemplate[] {
  const q = query.trim().toLowerCase();
  if (!q) return SECTION_TEMPLATES;
  return SECTION_TEMPLATES.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.tags.some((t) => t.toLowerCase().includes(q)),
  );
}
