/**
 * Templates — full-deck starters for the Insert panel.
 *
 * Per Wave 2 §S2.4 of docs/frontend-roadmap/02-wave-editor-surface.md.
 *
 * Each template is a thumbnail + use-case chips + a deck builder that
 * emits the slide spec. Updating the active deck overwrites the slide
 * list (positions preserved), so an "Insert template" is a single
 * bulk replace operation that flows through the engine bridge as one
 * applyOp call — undo is one click.
 *
 * The cover thumbnail is a CSS-style SVG drawn from the catalog; no
 * remote assets, no broken images.
 */

import type { Slide, AspectRatio, Element } from '@domio/schema';
import { asULID } from '@domio/schema';

export type UseCase = 'Pitch' | 'Board Report' | 'QBR' | 'All-hands' | 'Demo Day' | 'Sales' | 'Education';

export interface TemplateDef {
  id: string;
  name: string;
  description: string;
  useCases: readonly UseCase[];
  /** SVG markup string for the cover thumbnail (rendered via `dangerouslySetInnerHTML`). */
  cover: string;
  /** Build the slide list for this template. Receives the deck's default aspect. */
  buildSlides: (aspect: AspectRatio) => Slide[];
}

const DEFAULT_SIZE: Element['transform'] = {
  x: 0,
  y: 0,
  w: 0,
  h: 0,
  rotation: 0,
};

function makeText(opts: {
  id: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize?: number;
  fontWeight?: number;
  align?: 'left' | 'center' | 'right';
}): Element {
  // fontSize/fontWeight/align are accepted for editor readability but
  // aren't stored on the text layer — runtime theming applies them
  // based on the deck's theme tokens at render time.
  void opts.fontSize;
  void opts.fontWeight;
  void opts.align;
  return {
    id: asULID(opts.id),
    semanticId: opts.id,
    type: 'text',
    name: opts.text,
    parentId: null,
    transform: { ...DEFAULT_SIZE, x: opts.x, y: opts.y, w: opts.w, h: opts.h, rotation: 0 },
    text: { content: opts.text },
  };
}

function makeFrame(opts: {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  aspect: AspectRatio;
  fill: { type: 'solid'; color: { r: number; g: number; b: number; a: number } };
}): Element {
  return {
    id: asULID(opts.id),
    semanticId: opts.id,
    type: 'frame',
    name: 'Background',
    parentId: null,
    transform: { ...DEFAULT_SIZE, x: opts.x, y: opts.y, w: opts.w, h: opts.h, rotation: 0 },
    aspect: opts.aspect,
    fill: opts.fill,
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

const FILL_ACCENT = { type: 'solid' as const, color: { r: 0.345, g: 0.451, b: 0.953, a: 1 } };
const FILL_MUTED = { type: 'solid' as const, color: { r: 0.92, g: 0.93, b: 0.95, a: 1 } };
const FILL_DARK = { type: 'solid' as const, color: { r: 0.09, g: 0.11, b: 0.15, a: 1 } };

// ---------------------------------------------------------------------------
// 1. Investor Pitch — 6 slides.
// ---------------------------------------------------------------------------

const investorPitch: TemplateDef = {
  id: 'investor-pitch',
  name: 'Investor Pitch',
  description: 'Six-slide narrative: problem, solution, traction, ask.',
  useCases: ['Pitch', 'Board Report'],
  cover: `
    <svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="200" fill="#0b1220"/>
      <text x="20" y="60" font-family="Inter,sans-serif" font-size="22" font-weight="700" fill="#fff">Investor</text>
      <text x="20" y="86" font-family="Inter,sans-serif" font-size="22" font-weight="700" fill="#5b73ff">Pitch</text>
      <rect x="20" y="110" width="80" height="6" rx="3" fill="#5b73ff"/>
      <rect x="20" y="120" width="40" height="6" rx="3" fill="#27314a"/>
      <rect x="200" y="20" width="100" height="160" rx="8" fill="#1a2240"/>
      <circle cx="250" cy="80" r="22" fill="#5b73ff"/>
      <rect x="220" y="120" width="60" height="8" rx="4" fill="#27314a"/>
      <rect x="220" y="134" width="40" height="8" rx="4" fill="#27314a"/>
    </svg>
  `,
  buildSlides: (aspect) => {
    const w = 1600;
    const h = w * (aspect.ratioH / aspect.ratioW);
    return [
      makeSlide('pitch-cover', 0, aspect, [
        makeFrame({ id: 'pitch-cover-bg', x: 0, y: 0, w, h, aspect, fill: FILL_DARK }),
        makeText({ id: 'pitch-cover-title', text: 'Series A', x: 120, y: h * 0.4, w: w * 0.7, h: 120, fontSize: 84, fontWeight: 700, align: 'left' }),
        makeText({ id: 'pitch-cover-sub', text: 'The future of business storytelling', x: 120, y: h * 0.55, w: w * 0.7, h: 60, fontSize: 28, align: 'left' }),
      ], 'Cover'),
      makeSlide('pitch-problem', 1, aspect, [
        makeText({ id: 'pitch-problem-eyebrow', text: 'PROBLEM', x: 120, y: 100, w: 600, h: 30, fontSize: 18, fontWeight: 700 }),
        makeText({ id: 'pitch-problem-title', text: 'Slides are stale the moment they ship.', x: 120, y: 140, w: 1300, h: 120, fontSize: 48, fontWeight: 700 }),
        makeText({ id: 'pitch-problem-body', text: 'Decks lose the conversation. Numbers are wrong. Insights decay.', x: 120, y: 280, w: 1300, h: 80, fontSize: 24 }),
      ], 'Problem'),
      makeSlide('pitch-solution', 2, aspect, [
        makeText({ id: 'pitch-sol-eyebrow', text: 'SOLUTION', x: 120, y: 100, w: 600, h: 30, fontSize: 18, fontWeight: 700 }),
        makeText({ id: 'pitch-sol-title', text: 'Live, data-bound narrative.', x: 120, y: 140, w: 1300, h: 120, fontSize: 48, fontWeight: 700 }),
      ], 'Solution'),
      makeSlide('pitch-traction', 3, aspect, [
        makeText({ id: 'pitch-tr-eyebrow', text: 'TRACTION', x: 120, y: 100, w: 600, h: 30, fontSize: 18, fontWeight: 700 }),
        makeText({ id: 'pitch-tr-title', text: '3x growth Y/Y', x: 120, y: 140, w: 1300, h: 120, fontSize: 48, fontWeight: 700 }),
      ], 'Traction'),
      makeSlide('pitch-product', 4, aspect, [
        makeText({ id: 'pitch-pr-eyebrow', text: 'PRODUCT', x: 120, y: 100, w: 600, h: 30, fontSize: 18, fontWeight: 700 }),
        makeText({ id: 'pitch-pr-title', text: 'A platform, not a deck.', x: 120, y: 140, w: 1300, h: 120, fontSize: 48, fontWeight: 700 }),
      ], 'Product'),
      makeSlide('pitch-ask', 5, aspect, [
        makeFrame({ id: 'pitch-ask-bg', x: 0, y: 0, w, h, aspect, fill: FILL_ACCENT }),
        makeText({ id: 'pitch-ask-eyebrow', text: 'THE ASK', x: 120, y: h * 0.3, w: 600, h: 30, fontSize: 18, fontWeight: 700 }),
        makeText({ id: 'pitch-ask-title', text: 'Raising $8M Series A', x: 120, y: h * 0.4, w: 1300, h: 120, fontSize: 60, fontWeight: 700 }),
      ], 'Ask'),
    ];
  },
};

// ---------------------------------------------------------------------------
// 2. Board Report — 4 slides.
// ---------------------------------------------------------------------------

const boardReport: TemplateDef = {
  id: 'board-report',
  name: 'Board Report',
  description: 'Quarterly reporting: KPI, Financials, Product, Strategy.',
  useCases: ['Board Report', 'QBR'],
  cover: `
    <svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="200" fill="#f5f7fb"/>
      <rect x="20" y="20" width="280" height="160" rx="8" fill="#fff" stroke="#dde3ee"/>
      <rect x="40" y="40" width="110" height="60" rx="6" fill="#5b73ff"/>
      <text x="55" y="78" font-family="Inter,sans-serif" font-size="20" font-weight="700" fill="#fff">$2.4M</text>
      <rect x="40" y="110" width="110" height="60" rx="6" fill="#eef1f8"/>
      <text x="55" y="148" font-family="Inter,sans-serif" font-size="20" font-weight="700" fill="#0b1220">38%</text>
      <rect x="170" y="40" width="110" height="130" rx="6" fill="#eef1f8"/>
      <polyline points="180,150 195,130 210,135 225,110 240,90 260,70 275,75" stroke="#5b73ff" stroke-width="3" fill="none"/>
    </svg>
  `,
  buildSlides: (aspect) => {
    return [
      makeSlide('br-cover', 0, aspect, [
        makeText({ id: 'br-cover-eyebrow', text: 'Q4 BOARD REPORT', x: 120, y: 100, w: 800, h: 30, fontSize: 18, fontWeight: 700 }),
        makeText({ id: 'br-cover-title', text: 'Quarterly snapshot', x: 120, y: 140, w: 1300, h: 120, fontSize: 48, fontWeight: 700 }),
      ], 'Cover'),
      makeSlide('br-kpi', 1, aspect, [
        makeText({ id: 'br-kpi-eyebrow', text: 'KEY METRICS', x: 120, y: 100, w: 600, h: 30, fontSize: 18, fontWeight: 700 }),
        makeText({ id: 'br-kpi-title', text: 'Revenue, retention, growth.', x: 120, y: 140, w: 1300, h: 80, fontSize: 36, fontWeight: 700 }),
      ], 'KPI'),
      makeSlide('br-financials', 2, aspect, [
        makeText({ id: 'br-fin-eyebrow', text: 'FINANCIALS', x: 120, y: 100, w: 600, h: 30, fontSize: 18, fontWeight: 700 }),
        makeText({ id: 'br-fin-title', text: 'P&L summary', x: 120, y: 140, w: 1300, h: 80, fontSize: 36, fontWeight: 700 }),
      ], 'Financials'),
      makeSlide('br-strategy', 3, aspect, [
        makeText({ id: 'br-str-eyebrow', text: 'STRATEGY', x: 120, y: 100, w: 600, h: 30, fontSize: 18, fontWeight: 700 }),
        makeText({ id: 'br-str-title', text: 'Next quarter priorities', x: 120, y: 140, w: 1300, h: 80, fontSize: 36, fontWeight: 700 }),
      ], 'Strategy'),
    ];
  },
};

// ---------------------------------------------------------------------------
// 3. All-hands — 5 slides.
// ---------------------------------------------------------------------------

const allHands: TemplateDef = {
  id: 'all-hands',
  name: 'All-hands',
  description: 'Company-wide cadence: wins, roadmap, hiring, Q&A.',
  useCases: ['All-hands'],
  cover: `
    <svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="200" fill="#f5f7fb"/>
      <circle cx="160" cy="80" r="40" fill="#5b73ff" opacity="0.2"/>
      <circle cx="160" cy="80" r="24" fill="#5b73ff"/>
      <text x="160" y="84" text-anchor="middle" font-family="Inter,sans-serif" font-size="14" font-weight="700" fill="#fff">YOU</text>
      <rect x="40" y="140" width="240" height="40" rx="6" fill="#eef1f8"/>
      <text x="160" y="165" text-anchor="middle" font-family="Inter,sans-serif" font-size="14" font-weight="600" fill="#0b1220">All-hands · 30 min</text>
    </svg>
  `,
  buildSlides: (aspect) => {
    const w = 1600;
    const h = w * (aspect.ratioH / aspect.ratioW);
    return [
      makeSlide('ah-cover', 0, aspect, [
        makeText({ id: 'ah-cover-title', text: 'All-hands', x: 120, y: h * 0.4, w: 1300, h: 120, fontSize: 84, fontWeight: 700 }),
      ], 'Cover'),
      makeSlide('ah-wins', 1, aspect, [
        makeText({ id: 'ah-wins-title', text: 'Wins this month', x: 120, y: 100, w: 1300, h: 80, fontSize: 36, fontWeight: 700 }),
      ], 'Wins'),
      makeSlide('ah-roadmap', 2, aspect, [
        makeText({ id: 'ah-rm-title', text: 'Roadmap', x: 120, y: 100, w: 1300, h: 80, fontSize: 36, fontWeight: 700 }),
      ], 'Roadmap'),
      makeSlide('ah-hiring', 3, aspect, [
        makeText({ id: 'ah-hr-title', text: 'Hiring', x: 120, y: 100, w: 1300, h: 80, fontSize: 36, fontWeight: 700 }),
      ], 'Hiring'),
      makeSlide('ah-qa', 4, aspect, [
        makeText({ id: 'ah-qa-title', text: 'Q&A', x: 120, y: h * 0.45, w: 1300, h: 120, fontSize: 84, fontWeight: 700 }),
      ], 'Q&A'),
    ];
  },
};

// ---------------------------------------------------------------------------
// 4. Demo Day — 3 slides.
// ---------------------------------------------------------------------------

const demoDay: TemplateDef = {
  id: 'demo-day',
  name: 'Demo Day',
  description: 'Show off the latest work in three slides.',
  useCases: ['Demo Day', 'Pitch'],
  cover: `
    <svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="200" fill="#0b1220"/>
      <text x="160" y="110" text-anchor="middle" font-family="Inter,sans-serif" font-size="44" font-weight="700" fill="#fff">DEMO</text>
      <rect x="60" y="130" width="200" height="6" rx="3" fill="#5b73ff"/>
    </svg>
  `,
  buildSlides: (aspect) => {
    const w = 1600;
    const h = w * (aspect.ratioH / aspect.ratioW);
    return [
      makeSlide('dd-cover', 0, aspect, [
        makeFrame({ id: 'dd-bg', x: 0, y: 0, w, h, aspect, fill: FILL_DARK }),
        makeText({ id: 'dd-title', text: 'Demo day', x: 120, y: h * 0.4, w: 1300, h: 120, fontSize: 84, fontWeight: 700 }),
      ], 'Cover'),
      makeSlide('dd-demo', 1, aspect, [
        makeText({ id: 'dd-demo-title', text: 'Live demo', x: 120, y: 100, w: 1300, h: 80, fontSize: 36, fontWeight: 700 }),
      ], 'Demo'),
      makeSlide('dd-future', 2, aspect, [
        makeText({ id: 'dd-future-title', text: 'What\u2019s next', x: 120, y: 100, w: 1300, h: 80, fontSize: 36, fontWeight: 700 }),
      ], 'Next'),
    ];
  },
};

// ---------------------------------------------------------------------------
// 5. Education — 4 slides.
// ---------------------------------------------------------------------------

const education: TemplateDef = {
  id: 'education',
  name: 'Lecture',
  description: 'Outline-style lecture deck for a single concept.',
  useCases: ['Education'],
  cover: `
    <svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="200" fill="#f5f7fb"/>
      <rect x="20" y="20" width="280" height="160" rx="8" fill="#fff" stroke="#dde3ee"/>
      <text x="40" y="60" font-family="Inter,sans-serif" font-size="20" font-weight="700" fill="#0b1220">Module 03</text>
      <rect x="40" y="80" width="240" height="6" rx="3" fill="#5b73ff"/>
      <rect x="40" y="100" width="180" height="6" rx="3" fill="#dde3ee"/>
      <rect x="40" y="120" width="220" height="6" rx="3" fill="#dde3ee"/>
      <rect x="40" y="140" width="160" height="6" rx="3" fill="#dde3ee"/>
    </svg>
  `,
  buildSlides: (aspect) => {
    const w = 1600;
    const h = w * (aspect.ratioH / aspect.ratioW);
    return [
      makeSlide('edu-cover', 0, aspect, [
        makeFrame({ id: 'edu-bg', x: 0, y: 0, w, h, aspect, fill: FILL_MUTED }),
        makeText({ id: 'edu-cover-title', text: 'Module 03', x: 120, y: h * 0.3, w: 1300, h: 80, fontSize: 36, fontWeight: 700 }),
        makeText({ id: 'edu-cover-sub', text: 'Foundations of data storytelling', x: 120, y: h * 0.4, w: 1300, h: 120, fontSize: 60, fontWeight: 700 }),
      ], 'Cover'),
      makeSlide('edu-outline', 1, aspect, [
        makeText({ id: 'edu-outline-title', text: 'Today', x: 120, y: 100, w: 1300, h: 80, fontSize: 36, fontWeight: 700 }),
      ], 'Outline'),
      makeSlide('edu-content', 2, aspect, [
        makeText({ id: 'edu-content-title', text: 'Concept walkthrough', x: 120, y: 100, w: 1300, h: 80, fontSize: 36, fontWeight: 700 }),
      ], 'Content'),
      makeSlide('edu-recap', 3, aspect, [
        makeText({ id: 'edu-recap-title', text: 'Recap', x: 120, y: 100, w: 1300, h: 80, fontSize: 36, fontWeight: 700 }),
      ], 'Recap'),
    ];
  },
};

// ---------------------------------------------------------------------------
// 6. Sales Brief — 3 slides.
// ---------------------------------------------------------------------------

const salesBrief: TemplateDef = {
  id: 'sales-brief',
  name: 'Sales Brief',
  description: 'Prospect-ready one-pager: pain, fit, ask.',
  useCases: ['Sales'],
  cover: `
    <svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="200" fill="#f5f7fb"/>
      <rect x="40" y="40" width="240" height="120" rx="8" fill="#5b73ff"/>
      <text x="60" y="80" font-family="Inter,sans-serif" font-size="14" font-weight="700" fill="#fff">PROSPECT</text>
      <text x="60" y="120" font-family="Inter,sans-serif" font-size="22" font-weight="700" fill="#fff">Acme Inc</text>
      <text x="60" y="146" font-family="Inter,sans-serif" font-size="14" fill="#cfd5e8">3-minute brief</text>
    </svg>
  `,
  buildSlides: (aspect) => {
    return [
      makeSlide('sb-cover', 0, aspect, [
        makeText({ id: 'sb-cover-title', text: 'Acme Inc', x: 120, y: 100, w: 1300, h: 80, fontSize: 48, fontWeight: 700 }),
        makeText({ id: 'sb-cover-sub', text: '3-minute brief', x: 120, y: 200, w: 1300, h: 40, fontSize: 24 }),
      ], 'Cover'),
      makeSlide('sb-pain', 1, aspect, [
        makeText({ id: 'sb-pain-title', text: 'Today\u2019s pain', x: 120, y: 100, w: 1300, h: 80, fontSize: 36, fontWeight: 700 }),
      ], 'Pain'),
      makeSlide('sb-fit', 2, aspect, [
        makeText({ id: 'sb-fit-title', text: 'How we fit', x: 120, y: 100, w: 1300, h: 80, fontSize: 36, fontWeight: 700 }),
      ], 'Fit'),
    ];
  },
};

export const TEMPLATES: readonly TemplateDef[] = [
  investorPitch,
  boardReport,
  allHands,
  demoDay,
  education,
  salesBrief,
];

export function getTemplate(id: string): TemplateDef | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function searchTemplates(query: string): readonly TemplateDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return TEMPLATES;
  return TEMPLATES.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.useCases.some((u) => u.toLowerCase().includes(q)),
  );
}

export function templatesByUseCase(useCase: UseCase): readonly TemplateDef[] {
  return TEMPLATES.filter((t) => t.useCases.includes(useCase));
}
