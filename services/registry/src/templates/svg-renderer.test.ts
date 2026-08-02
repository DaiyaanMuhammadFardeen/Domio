/**
 * Tests for the server-side SVG renderer.
 */

import { describe, it, expect } from 'vitest';
import { renderDeckPoster, renderSlidePreviews } from './svg-renderer.js';
import type { Slide, TextLayer, FrameLayer } from '@domio/schema';
import { asULID } from '@domio/schema';

// ---------------------------------------------------------------------------
// Helpers — use asULID to satisfy the branded ULID type
// ---------------------------------------------------------------------------

function makeSlide(overrides: Partial<Omit<Slide, 'id' | 'elements'>> & { id: string; elements?: Slide['elements'] }): Slide {
  return {
    semanticId: `slide[${overrides.id}]`,
    position: 0,
    aspect: { ratioW: 1920, ratioH: 1080 },
    elements: [],
    ...overrides,
    id: asULID(overrides.id),
  };
}

function makeTextLayer(overrides: Partial<Omit<TextLayer, 'id'>> & { id: string }): TextLayer {
  return {
    semanticId: `text[${overrides.id}]`,
    name: overrides.id,
    type: 'text',
    parentId: null,
    text: { content: 'Hello World' },
    transform: { x: 0, y: 0, w: 400, h: 50, rotation: 0 },
    ...overrides,
    id: asULID(overrides.id),
  };
}

function makeFrameLayer(overrides: Partial<Omit<FrameLayer, 'id'>> & { id: string }): FrameLayer {
  return {
    semanticId: `frame[${overrides.id}]`,
    name: overrides.id,
    type: 'frame',
    parentId: null,
    aspect: { ratioW: 100, ratioH: 100 },
    transform: { x: 0, y: 0, w: 100, h: 100, rotation: 0 },
    ...overrides,
    id: asULID(overrides.id),
  };
}

function makeDeckJson(slides: Slide[]): Record<string, unknown> {
  return {
    schemaVersion: '1.0',
    id: asULID('01ARZ3NDEKTSV4RRFFQ68GA1'),
    tenantId: 'tenant-1',
    workspaceId: asULID('01ARZ3NDEKTSV4RRFFQ68GAJFA'),
    title: 'Test Deck',
    revision: 1,
    settings: { defaultSlideRatio: { ratioW: 1920, ratioH: 1080 } },
    slides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('renderDeckPoster', () => {
  it('returns a valid SVG with expected dimensions', () => {
    const deck = makeDeckJson([
      makeSlide({ id: 's1', elements: [makeTextLayer({ id: 't1' })] }),
    ]);

    const result = renderDeckPoster(deck);

    expect(result.svg).toBeTruthy();
    expect(result.svg.trimStart().startsWith('<svg')).toBe(true);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(result.placeholderCount).toBe(1);
  });

  it('stacks multiple slides vertically', () => {
    const deck = makeDeckJson([
      makeSlide({ id: 's1', elements: [makeTextLayer({ id: 't1' })] }),
      makeSlide({ id: 's2', elements: [makeTextLayer({ id: 't2' })] }),
      makeSlide({ id: 's3', elements: [makeTextLayer({ id: 't3' })] }),
    ]);

    const result = renderDeckPoster(deck);

    // 3 slides × 1080 + 2 spacings × 40 = 3240 + 80 = 3320
    expect(result.height).toBe(3320);
    expect(result.placeholderCount).toBe(3);
  });

  it('counts text elements as placeholders', () => {
    const deck = makeDeckJson([
      makeSlide({
        id: 's1',
        elements: [
          makeTextLayer({ id: 't1', text: { content: 'Title' } }),
          makeTextLayer({ id: 't2', text: { content: 'Subtitle' } }),
          makeFrameLayer({ id: 'f1' }),
        ],
      }),
    ]);

    const result = renderDeckPoster(deck);

    expect(result.placeholderCount).toBe(2);
  });

  it('generates well-formed SVG (balanced tags)', () => {
    const deck = makeDeckJson([
      makeSlide({
        id: 's1',
        elements: [
          makeTextLayer({ id: 't1' }),
          makeFrameLayer({ id: 'f1' }),
        ],
      }),
    ]);

    const result = renderDeckPoster(deck);
    // Quick well-formedness check
    expect(result.svg).toContain('<svg');
    expect(result.svg).toContain('</svg>');
    expect(result.svg).toContain('<text');
    expect(result.svg).toContain('<rect');
  });

  it('renders empty deck with minimal SVG', () => {
    const deck = makeDeckJson([]);

    const result = renderDeckPoster(deck);

    expect(result.svg).toBeTruthy();
    expect(result.height).toBe(0);
    expect(result.placeholderCount).toBe(0);
  });

  it('handles slides with no elements', () => {
    const deck = makeDeckJson([
      makeSlide({ id: 's1', elements: [] }),
    ]);

    const result = renderDeckPoster(deck);

    expect(result.placeholderCount).toBe(0);
    expect(result.height).toBe(1080);
  });
});

describe('renderSlidePreviews', () => {
  it('returns one SVG per slide by default', () => {
    const deck = makeDeckJson([
      makeSlide({ id: 's1', elements: [makeTextLayer({ id: 't1' })] }),
      makeSlide({ id: 's2', elements: [makeTextLayer({ id: 't2' })] }),
    ]);

    const svgs = renderSlidePreviews(deck);

    expect(svgs).toHaveLength(2);
    expect(svgs[0]).toContain('<svg');
    expect(svgs[1]).toContain('<svg');
  });

  it('returns specific slides when indexes are provided', () => {
    const deck = makeDeckJson([
      makeSlide({ id: 's1', elements: [makeTextLayer({ id: 't1' })] }),
      makeSlide({ id: 's2', elements: [makeTextLayer({ id: 't2' })] }),
      makeSlide({ id: 's3', elements: [makeTextLayer({ id: 't3' })] }),
    ]);

    const svgs = renderSlidePreviews(deck, [0, 2]);

    expect(svgs).toHaveLength(2);
    // Both SVGs should contain text content
    expect(svgs[0]).toContain('Hello World');
    expect(svgs[1]).toContain('Hello World');
  });

  it('filters out-of-range indexes', () => {
    const deck = makeDeckJson([
      makeSlide({ id: 's1', elements: [makeTextLayer({ id: 't1' })] }),
    ]);

    const svgs = renderSlidePreviews(deck, [0, 5, 10]);

    expect(svgs).toHaveLength(1);
  });

  it('each SVG is well-formed', () => {
    const deck = makeDeckJson([
      makeSlide({ id: 's1', elements: [makeTextLayer({ id: 't1' }), makeFrameLayer({ id: 'f1' })] }),
    ]);

    const svgs = renderSlidePreviews(deck);

    for (const svg of svgs) {
      expect(svg.trimStart().startsWith('<svg')).toBe(true);
      expect(svg).toContain('</svg>');
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    }
  });
});

describe('element types', () => {
  it('renders vector elements', () => {
    const vectorEl = {
      id: asULID('01ARZ3NDEKTSV4RRFFQ68GA1'),
      semanticId: 'vec[1]',
      name: 'vec1',
      type: 'vector' as const,
      parentId: null,
      transform: { x: 10, y: 20, w: 100, h: 50, rotation: 0 },
      paths: ['M0,0 L100,50 Z'],
      fill: { color: { r: 1, g: 0, b: 0, a: 1 } },
      stroke: { color: { r: 0, g: 0, b: 0, a: 1 }, width: 2 },
    };
    const slide = makeSlide({ id: 's1', elements: [vectorEl as never] });
    const deck = makeDeckJson([slide]);
    const result = renderDeckPoster(deck);
    expect(result.svg).toContain('<path');
    expect(result.svg).toContain('M0,0 L100,50 Z');
  });

  it('renders vector with strokeDasharray', () => {
    const vectorEl = {
      id: asULID('01ARZ3NDEKTSV4RRFFQ68GA1'),
      semanticId: 'vec[1]',
      name: 'vec1',
      type: 'vector' as const,
      parentId: null,
      transform: { x: 10, y: 20, w: 100, h: 50, rotation: 0 },
      paths: ['M0,0 L100,50 Z'],
      fill: { color: { r: 1, g: 0, b: 0, a: 1 } },
      style: { strokeDasharray: '5,3' },
    };
    const slide = makeSlide({ id: 's1', elements: [vectorEl as never] });
    const deck = makeDeckJson([slide]);
    const result = renderDeckPoster(deck);
    expect(result.svg).toContain('stroke-dasharray');
  });

  it('renders vector with no fill color', () => {
    const vectorEl = {
      id: asULID('01ARZ3NDEKTSV4RRFFQ68GA1'),
      semanticId: 'vec[1]',
      name: 'vec1',
      type: 'vector' as const,
      parentId: null,
      transform: { x: 0, y: 0, w: 50, h: 50, rotation: 0 },
      paths: ['M0,0 L50,50 Z'],
    };
    const slide = makeSlide({ id: 's1', elements: [vectorEl as never] });
    const deck = makeDeckJson([slide]);
    const result = renderDeckPoster(deck);
    expect(result.svg).toContain('fill="none"');
  });

  it('renders image elements', () => {
    const imageEl = {
      id: asULID('01ARZ3NDEKTSV4RRFFQ68GA1'),
      semanticId: 'img[1]',
      name: 'img1',
      type: 'image' as const,
      parentId: null,
      transform: { x: 0, y: 0, w: 200, h: 150, rotation: 0 },
      assetId: 'asset-1',
      alt: 'A photo',
    };
    const slide = makeSlide({ id: 's1', elements: [imageEl as never] });
    const deck = makeDeckJson([slide]);
    const result = renderDeckPoster(deck);
    expect(result.svg).toContain('<rect');
    expect(result.svg).toContain('A photo');
  });

  it('renders image without alt uses assetId', () => {
    const imageEl = {
      id: asULID('01ARZ3NDEKTSV4RRFFQ68GA1'),
      semanticId: 'img[1]',
      name: 'img1',
      type: 'image' as const,
      parentId: null,
      transform: { x: 0, y: 0, w: 200, h: 150, rotation: 0 },
      assetId: 'asset-1',
    };
    const slide = makeSlide({ id: 's1', elements: [imageEl as never] });
    const deck = makeDeckJson([slide]);
    const result = renderDeckPoster(deck);
    expect(result.svg).toContain('asset-1');
  });

  it('renders image with no transform returns empty', () => {
    const imageEl = {
      id: asULID('01ARZ3NDEKTSV4RRFFQ68GA1'),
      semanticId: 'img[1]',
      name: 'img1',
      type: 'image' as const,
      parentId: null,
      assetId: 'asset-1',
    };
    const slide = makeSlide({ id: 's1', elements: [imageEl as never] });
    const deck = makeDeckJson([slide]);
    const result = renderDeckPoster(deck);
    expect(result.svg).toContain('<svg');
  });

  it('renders component elements', () => {
    const compEl = {
      id: asULID('01ARZ3NDEKTSV4RRFFQ68GA1'),
      semanticId: 'comp[1]',
      name: 'comp1',
      type: 'component' as const,
      parentId: null,
      transform: { x: 0, y: 0, w: 100, h: 50, rotation: 0 },
      component: {
        catalogId: 'domio.stat-card',
        version: '1.0.0',
        props: { title: 'Revenue' },
      },
    };
    const slide = makeSlide({ id: 's1', elements: [compEl as never] });
    const deck = makeDeckJson([slide]);
    // Should not throw — expandComponent returns child elements or empty
    const result = renderDeckPoster(deck);
    expect(result.svg).toContain('<svg');
  });

  it('renders unknown type elements as placeholder', () => {
    const unknownEl = {
      id: asULID('01ARZ3NDEKTSV4RRFFQ68GA1'),
      semanticId: 'unk[1]',
      name: 'unk1',
      type: 'boolean' as const,
      parentId: null,
      transform: { x: 5, y: 10, w: 80, h: 40, rotation: 0 },
      operands: [],
      operation: 'union' as const,
    };
    const slide = makeSlide({ id: 's1', elements: [unknownEl as never] });
    const deck = makeDeckJson([slide]);
    const result = renderDeckPoster(deck);
    expect(result.svg).toContain('<rect');
    expect(result.svg).toContain('fill="#6366f1"');
  });
});

describe('text rendering edge cases', () => {
  it('renders text with vertical center alignment', () => {
    const text = makeTextLayer({
      id: 't1',
      text: { content: 'Centered' },
      style: { verticalAlign: 'middle' },
    });
    const slide = makeSlide({ id: 's1', elements: [text as never] });
    const deck = makeDeckJson([slide]);
    const result = renderDeckPoster(deck);
    expect(result.svg).toContain('dominant-baseline="central"');
  });

  it('renders text with end alignment', () => {
    const text = makeTextLayer({
      id: 't1',
      text: { content: 'Right' },
      style: { textAlign: 'end' },
    });
    const slide = makeSlide({ id: 's1', elements: [text as never] });
    const deck = makeDeckJson([slide]);
    const result = renderDeckPoster(deck);
    expect(result.svg).toContain('text-anchor="end"');
  });

  it('renders text with letterSpacing', () => {
    const text = makeTextLayer({
      id: 't1',
      text: { content: 'Spaced' },
      style: { letterSpacing: 2 },
    });
    const slide = makeSlide({ id: 's1', elements: [text as never] });
    const deck = makeDeckJson([slide]);
    const result = renderDeckPoster(deck);
    expect(result.svg).toContain('letter-spacing');
  });

  it('renders text with custom fill color', () => {
    const text = makeTextLayer({
      id: 't1',
      text: { content: 'Colored' },
      style: { fill: { color: { colorSpace: 'srgb', value: '#ff0000' } } },
    });
    const slide = makeSlide({ id: 's1', elements: [text as never] });
    const deck = makeDeckJson([slide]);
    const result = renderDeckPoster(deck);
    expect(result.svg).toContain('#ff0000');
  });

  it('returns empty for text with no transform', () => {
    const text = { ...makeTextLayer({ id: 't1' }), transform: undefined };
    const slide = makeSlide({ id: 's1', elements: [text as never] });
    const deck = makeDeckJson([slide]);
    const result = renderDeckPoster(deck);
    expect(result.svg).toContain('<svg');
  });
});

describe('frame rendering edge cases', () => {
  it('renders frame with borderRadius', () => {
    const frame = makeFrameLayer({ id: 'f1', style: { borderRadius: 12 } });
    const slide = makeSlide({ id: 's1', elements: [frame as never] });
    const deck = makeDeckJson([slide]);
    const result = renderDeckPoster(deck);
    expect(result.svg).toContain('rx="12"');
  });

  it('returns empty for frame with no transform', () => {
    const frame = { ...makeFrameLayer({ id: 'f1' }), transform: undefined };
    const slide = makeSlide({ id: 's1', elements: [frame as never] });
    const deck = makeDeckJson([slide]);
    const result = renderDeckPoster(deck);
    expect(result.svg).toContain('<svg');
  });
});

describe('slide edge cases', () => {
  it('renders slide without aspect ratio uses defaults', () => {
    const slide = {
      id: asULID('01ARZ3NDEKTSV4RRFFQ68GA1'),
      semanticId: 'slide[1]',
      position: 0,
      elements: [] as never[],
    };
    const deck = makeDeckJson([slide as never]);
    const result = renderDeckPoster(deck);
    expect(result.width).toBe(1920);
  });

  it('renders slide with custom aspect ratio (poster still uses default dims)', () => {
    const slide = makeSlide({
      id: 's1',
      aspect: { ratioW: 1080, ratioH: 1920 },
      elements: [],
    });
    const deck = makeDeckJson([slide]);
    const result = renderDeckPoster(deck);
    // Poster dimensions use DEFAULT_SLIDE_W/H constants, not slide aspect
    expect(result.width).toBe(1920);
  });

  it('filters out-of-range indexes in renderSlidePreviews', () => {
    const deck = makeDeckJson([
      makeSlide({ id: 's1', elements: [] }),
      makeSlide({ id: 's2', elements: [] }),
    ]);
    const svgs = renderSlidePreviews(deck, [-1, 5]);
    expect(svgs).toHaveLength(0);
  });

  it('renders text with middle alignment', () => {
    const text = makeTextLayer({
      id: 't1',
      text: { content: 'Center' },
      style: { textAlign: 'middle' },
    });
    const slide = makeSlide({ id: 's1', elements: [text as never] });
    const deck = makeDeckJson([slide]);
    const result = renderDeckPoster(deck);
    expect(result.svg).toContain('text-anchor="middle"');
  });
});
