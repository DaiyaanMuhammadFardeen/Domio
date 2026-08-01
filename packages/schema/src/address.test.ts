import { describe, it, expect } from 'vitest';
import {
  DefaultAddressResolver,
  isValidSemanticAddress,
  type AddressSegment,
} from './address.js';
import { validate } from './validate.js';
import type { DeckDocument } from './generated/scene-graph.js';
import { asULID } from './generated/scene-graph.js';

const SLIDE_ID = asULID('01H00000000000000000000000');
const WORKSPACE_ID = asULID('01H00000000000000000000001');
const DECK_ID = asULID('01H00000000000000000000002');
const FRAME_ID = asULID('01H00000000000000000000003');
const TITLE_ID = asULID('01H00000000000000000000004');
const CHART_ID = asULID('01H00000000000000000000005');
const GROUP_ID = asULID('01H00000000000000000000006');

const minimalDeck: DeckDocument = {
  schemaVersion: '1.0.0',
  id: DECK_ID,
  tenantId: 'tenant-1',
  workspaceId: WORKSPACE_ID,
  title: 'Example deck',
  revision: 0,
  settings: { defaultSlideRatio: { ratioW: 16, ratioH: 9 } },
  slides: [
    {
      id: SLIDE_ID,
      semanticId: 'intro',
      position: 0,
      aspect: { ratioW: 16, ratioH: 9 },
      elements: [
        {
          id: FRAME_ID,
          semanticId: 'hero',
          type: 'frame',
          name: 'Hero',
          parentId: null,
          aspect: { ratioW: 16, ratioH: 9 },
        },
        {
          id: GROUP_ID,
          semanticId: 'cluster',
          type: 'group',
          name: 'Cluster',
          parentId: null,
        },
        {
          id: TITLE_ID,
          semanticId: 'title',
          type: 'text',
          name: 'Title',
          parentId: null,
          text: { content: 'Welcome' },
        },
        {
          id: CHART_ID,
          semanticId: 'revenue_by_region',
          type: 'vector',
          name: 'Revenue by region',
          parentId: GROUP_ID,
          paths: ['M0,0 L100,100'],
        },
      ],
    },
  ],
};

const VALID_ADDRESSES: string[] = [
  'slide[intro]',
  'slide[intro].frame[hero]',
  'slide[intro].text[title]',
  'slide[intro].group[cluster].vector[revenue_by_region]',
  'slide[overview]',
  'Slide[intro]',
];

const INVALID_ADDRESSES: string[] = [
  'slide[]',
  'slide[intro][title]',
  ' slide[intro]',
  'slide[intro].',
  '',
  '1slide[intro]',
];

describe('SemanticAddress grammar', () => {
  it.each(VALID_ADDRESSES)('accepts valid address %s', (address) => {
    expect(isValidSemanticAddress(address)).toBe(true);
  });

  it.each(INVALID_ADDRESSES)('rejects invalid address %s', (address) => {
    expect(isValidSemanticAddress(address)).toBe(false);
  });

  it('parses single-segment addresses', () => {
    const segments: AddressSegment[] = new DefaultAddressResolver().parse('slide[intro]');
    expect(segments).toEqual([{ role: 'slide', name: 'intro' }]);
  });

  it('parses multi-segment addresses', () => {
    const segments = new DefaultAddressResolver().parse(
      'slide[intro].group[cluster].vector[revenue_by_region]',
    );
    expect(segments).toEqual([
      { role: 'slide', name: 'intro' },
      { role: 'group', name: 'cluster' },
      { role: 'vector', name: 'revenue_by_region' },
    ]);
  });
});

describe('DefaultAddressResolver', () => {
  it('resolves a slide-level address to the matching slide index', () => {
    const result = new DefaultAddressResolver().resolve(minimalDeck, 'slide[intro]');
    expect(result).not.toBeNull();
    if (result?.kind === 'slide') {
      expect(result.index).toBe(0);
    } else {
      throw new Error('expected slide resolution');
    }
  });

  it('resolves an element-level address', () => {
    const result = new DefaultAddressResolver().resolve(
      minimalDeck,
      'slide[intro].vector[revenue_by_region]',
    );
    expect(result).not.toBeNull();
    if (result?.kind === 'element') {
      expect(result.slideIndex).toBe(0);
      expect(result.elementIndex).toBe(3);
    } else {
      throw new Error('expected element resolution');
    }
  });

  it('returns null for missing slides', () => {
    expect(
      new DefaultAddressResolver().resolve(minimalDeck, 'slide[missing]'),
    ).toBeNull();
  });

  it('returns null for missing elements on existing slide', () => {
    expect(
      new DefaultAddressResolver().resolve(minimalDeck, 'slide[intro].vector[nope]'),
    ).toBeNull();
  });

  it('detects collisions deterministically in the structural validator', () => {
    const duped: DeckDocument = {
      ...minimalDeck,
      slides: [
        {
          ...minimalDeck.slides[0]!,
          elements: [
            minimalDeck.slides[0]!.elements[0]!,
            minimalDeck.slides[0]!.elements[0]!,
          ],
        },
      ],
    };
    expect(validate(duped).errors.some((error) => error.code === 'duplicate_id')).toBe(true);
  });

  it('reports deterministic collision behavior for deeply nested groups', () => {
    const nested: DeckDocument = {
      ...minimalDeck,
      slides: [
        {
          ...minimalDeck.slides[0]!,
          elements: [
            {
              id: asULID('01H00000000000000000000010'),
              semanticId: 'outer',
              type: 'group',
              name: 'Outer',
              parentId: null,
            },
            {
              id: asULID('01H00000000000000000000011'),
              semanticId: 'inner',
              type: 'group',
              name: 'Inner',
              parentId: asULID('01H00000000000000000000010'),
            },
            {
              id: asULID('01H00000000000000000000012'),
              semanticId: 'leaf',
              type: 'text',
              name: 'Leaf',
              parentId: asULID('01H00000000000000000000011'),
              text: { content: 'Hi' },
            },
          ],
        },
      ],
    };
    expect(
      new DefaultAddressResolver().resolve(
        nested,
        'slide[intro].group[outer].group[inner].text[leaf]',
      ),
    ).toEqual({ kind: 'element', slideIndex: 0, elementIndex: 2, address: expect.any(String) });
  });

  it('addressOf returns the canonical address for an element', () => {
    const address = new DefaultAddressResolver().addressOf(minimalDeck, {
      slideIndex: 0,
      elementIndex: 3,
    });
    expect(address).toBe('slide[intro].group[cluster].vector[revenue_by_region]');
  });
});

describe('AddressResolver API surface', () => {
  it('exposes parse, resolve, and addressOf via the singleton resolver', () => {
    const resolver = new DefaultAddressResolver();
    expect(resolver.parse('slide[intro]')).toHaveLength(1);
    expect(resolver.resolve(minimalDeck, 'slide[intro]')).not.toBeNull();
    expect(
      resolver.addressOf(minimalDeck, { slideIndex: 0, elementIndex: 2 }),
    ).toBe('slide[intro].text[title]');
  });
});