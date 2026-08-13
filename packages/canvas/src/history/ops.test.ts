import { describe, it, expect } from 'vitest';
import {
  dataBindingOp,
  thresholdOp,
  filterOp,
  timelineOp,
  transitionOp,
  magicMoveOp,
  reducedMotionOp,
  hotspotOp,
  overlayOp,
  branchingEdgeOp,
  variableOp,
  conditionalRuleOp,
  variableBindingOp,
  applyOp,
  type LiveDataBinding,
  type ThresholdRule,
  type CrossFilter,
  type LayerTimeline,
  type SlideTransition,
} from './ops.js';
import { asULID, type DeckDocument, type Element } from '@domio/schema';

const DECK_ID = asULID('01H00000000000000000000000');
const SLIDE_ID = asULID('01H00000000000000000000001');
const SLIDE_ID_2 = asULID('01H00000000000000000000002');
const COMP_A = asULID('01H00000000000000000000010');
const COMP_B = asULID('01H00000000000000000000011');

const SAMPLE_BINDING: LiveDataBinding = {
  queryId: 'q-1',
  fieldMap: { label: 'row.name', value: 'row.amount' },
  listenToFilters: ['region'],
};

const SAMPLE_RULES: ThresholdRule[] = [
  {
    id: 'r1',
    measure: 'revenue',
    comparator: 'gt',
    values: [1000],
    severity: 'warn',
    styleOverride: { color: '#ff0000' },
  },
];

const SAMPLE_FILTERS: CrossFilter[] = [
  { id: 'f1', dimension: 'region', value: 'North America' },
  { id: 'f2', dimension: 'month', value: 'Jan' },
];

const SAMPLE_TIMELINE: LayerTimeline = {
  id: 'tl-1',
  durationMs: 1000,
  loop: false,
  playCount: 1,
  startOffsetMs: 0,
  tracks: [
    {
      property: 'opacity',
      keyframes: [
        { timeMs: 0, value: 0 },
        { timeMs: 500, value: 1, easing: 'ease-in' },
      ],
    },
  ],
};

const SAMPLE_TRANSITION: SlideTransition = {
  kind: 'fade',
  durationMs: 300,
  easing: 'ease-in-out',
};

function buildDoc(): DeckDocument {
  return {
    schemaVersion: '1.0.0',
    id: DECK_ID,
    tenantId: 't',
    workspaceId: asULID('01H00000000000000000000FFF'),
    title: 'Test',
    revision: 0,
    settings: { defaultSlideRatio: { ratioW: 16, ratioH: 9 } },
    slides: [
      {
        id: SLIDE_ID,
        semanticId: 's',
        position: 0,
        aspect: { ratioW: 16, ratioH: 9 },
        elements: [
          {
            id: COMP_A,
            semanticId: 'ca',
            type: 'component',
            name: 'CompA',
            parentId: null,
            z: 0,
            transform: { x: 0, y: 0, w: 100, h: 100, rotation: 0, scale: 1 },
            component: {
              catalogId: 'domio.stat-card',
              version: '1.0.0',
              props: { color: 'blue', size: 42 },
            },
          } satisfies Element,
          {
            id: COMP_B,
            semanticId: 'cb',
            type: 'component',
            name: 'CompB',
            parentId: null,
            z: 1,
            transform: { x: 200, y: 200, w: 100, h: 100, rotation: 0, scale: 1 },
            component: {
              catalogId: 'domio.bar-chart',
              version: '1.0.0',
              props: { orientation: 'vertical' },
            },
          } satisfies Element,
        ],
      },
      {
        id: SLIDE_ID_2,
        semanticId: 's2',
        position: 1,
        aspect: { ratioW: 16, ratioH: 9 },
        elements: [],
      },
    ],
  };
}

/** Narrow a deck's first-slide element to a ComponentLayer by id. */
function comp(doc: DeckDocument, id: string) {
  const el = doc.slides[0]!.elements.find((e) => e.id === id)!;
  if (el.type !== 'component') throw new Error(`Element ${id} is not a component`);
  return el;
}

// -------------------------------------------------------------------
// DataBindingOp
// -------------------------------------------------------------------
describe('DataBindingOp', () => {
  it('bind sets the x-domio:binding prop key', () => {
    const doc = buildDoc();
    const op = dataBindingOp(COMP_A, SAMPLE_BINDING, undefined, 0);
    const next = applyOp(doc, op);
    expect(comp(next, COMP_A).component.props['x-domio:binding']).toEqual(SAMPLE_BINDING);
  });

  it('unbind (null) deletes the x-domio:binding prop key', () => {
    const doc = buildDoc();
    const bind = dataBindingOp(COMP_A, SAMPLE_BINDING, undefined, 0);
    const bound = applyOp(doc, bind);
    const unbind = dataBindingOp(COMP_A, null, SAMPLE_BINDING, 1);
    const unbound = applyOp(bound, unbind);
    expect(comp(unbound, COMP_A).component.props).not.toHaveProperty('x-domio:binding');
  });

  it('rebind overwrites a previous binding', () => {
    const doc = buildDoc();
    const bind1 = dataBindingOp(COMP_A, SAMPLE_BINDING, undefined, 0);
    const step1 = applyOp(doc, bind1);
    const newBinding: LiveDataBinding = {
      queryId: 'q-2',
      fieldMap: { val: 'row.total' },
      listenToFilters: [],
    };
    const bind2 = dataBindingOp(COMP_A, newBinding, SAMPLE_BINDING, 1);
    const step2 = applyOp(step1, bind2);
    expect(comp(step2, COMP_A).component.props['x-domio:binding']).toEqual(newBinding);
  });

  it('other props are untouched (deep-equal snapshot)', () => {
    const doc = buildDoc();
    const op = dataBindingOp(COMP_A, SAMPLE_BINDING, undefined, 0);
    const next = applyOp(doc, op);
    const el = comp(next, COMP_A);
    expect(el.component.props['color']).toBe('blue');
    expect(el.component.props['size']).toBe(42);
  });

  it('revert restores the pre-op props object (identity deep-equal)', () => {
    const doc = buildDoc();
    const preProps = { ...comp(doc, COMP_A).component.props };
    const op = dataBindingOp(COMP_A, SAMPLE_BINDING, undefined, 0);
    const bound = applyOp(doc, op);
    const reverted = applyOp(bound, {
      ...op,
      forward: op.inverse,
      inverse: op.forward,
    });
    expect(comp(reverted, COMP_A).component.props).toEqual(preProps);
  });

  it('ops are pure — input layer object is not mutated', () => {
    const doc = buildDoc();
    const originalPropsSnapshot = JSON.stringify(comp(doc, COMP_A).component.props);
    applyOp(doc, dataBindingOp(COMP_A, SAMPLE_BINDING, undefined, 0));
    expect(JSON.stringify(comp(doc, COMP_A).component.props)).toBe(originalPropsSnapshot);
  });
});

// -------------------------------------------------------------------
// ThresholdOp
// -------------------------------------------------------------------
describe('ThresholdOp', () => {
  it('thresholds set the x-domio:thresholds prop key', () => {
    const doc = buildDoc();
    const op = thresholdOp(COMP_A, SAMPLE_RULES, undefined, 0);
    const next = applyOp(doc, op);
    expect(comp(next, COMP_A).component.props['x-domio:thresholds']).toEqual(SAMPLE_RULES);
  });

  it('revert restores the pre-op props exactly', () => {
    const doc = buildDoc();
    const preProps = { ...comp(doc, COMP_A).component.props };
    const op = thresholdOp(COMP_A, SAMPLE_RULES, undefined, 0);
    const applied = applyOp(doc, op);
    const reverted = applyOp(applied, {
      ...op,
      forward: op.inverse,
      inverse: op.forward,
    });
    expect(comp(reverted, COMP_A).component.props).toEqual(preProps);
  });

  it('does not affect other component elements', () => {
    const doc = buildDoc();
    const op = thresholdOp(COMP_A, SAMPLE_RULES, undefined, 0);
    const next = applyOp(doc, op);
    const elB = comp(next, COMP_B);
    expect(elB.component.props['x-domio:thresholds']).toBeUndefined();
    expect(elB.component.props['orientation']).toBe('vertical');
  });

  it('ops are pure — input layer object is not mutated', () => {
    const doc = buildDoc();
    const originalPropsSnapshot = JSON.stringify(comp(doc, COMP_A).component.props);
    applyOp(doc, thresholdOp(COMP_A, SAMPLE_RULES, undefined, 0));
    expect(JSON.stringify(comp(doc, COMP_A).component.props)).toBe(originalPropsSnapshot);
  });
});

// -------------------------------------------------------------------
// FilterOp
// -------------------------------------------------------------------
describe('FilterOp', () => {
  it('filters set the x-domio:filters prop key', () => {
    const doc = buildDoc();
    const op = filterOp(COMP_A, SAMPLE_FILTERS, undefined, 0);
    const next = applyOp(doc, op);
    expect(comp(next, COMP_A).component.props['x-domio:filters']).toEqual(SAMPLE_FILTERS);
  });

  it('clearing filters (empty array) sets empty array', () => {
    const doc = buildDoc();
    const set = filterOp(COMP_A, SAMPLE_FILTERS, undefined, 0);
    const bound = applyOp(doc, set);
    const clear = filterOp(COMP_A, [], SAMPLE_FILTERS, 1);
    const cleared = applyOp(bound, clear);
    expect(comp(cleared, COMP_A).component.props['x-domio:filters']).toEqual([]);
  });

  it('revert restores the pre-op props exactly', () => {
    const doc = buildDoc();
    const preProps = { ...comp(doc, COMP_A).component.props };
    const op = filterOp(COMP_A, SAMPLE_FILTERS, undefined, 0);
    const applied = applyOp(doc, op);
    const reverted = applyOp(applied, {
      ...op,
      forward: op.inverse,
      inverse: op.forward,
    });
    expect(comp(reverted, COMP_A).component.props).toEqual(preProps);
  });

  it('does not affect other component elements', () => {
    const doc = buildDoc();
    const op = filterOp(COMP_A, SAMPLE_FILTERS, undefined, 0);
    const next = applyOp(doc, op);
    const elB = comp(next, COMP_B);
    expect(elB.component.props['x-domio:filters']).toBeUndefined();
    expect(elB.component.props['orientation']).toBe('vertical');
  });

  it('ops are pure — input layer object is not mutated', () => {
    const doc = buildDoc();
    const originalPropsSnapshot = JSON.stringify(comp(doc, COMP_A).component.props);
    applyOp(doc, filterOp(COMP_A, SAMPLE_FILTERS, undefined, 0));
    expect(JSON.stringify(comp(doc, COMP_A).component.props)).toBe(originalPropsSnapshot);
  });
});

// -------------------------------------------------------------------
// TimelineOp
// -------------------------------------------------------------------
describe('TimelineOp', () => {
  it('set timeline applies the x-domio:timeline prop key', () => {
    const doc = buildDoc();
    const op = timelineOp(COMP_A, SAMPLE_TIMELINE, undefined, 0);
    const next = applyOp(doc, op);
    expect(comp(next, COMP_A).component.props['x-domio:timeline']).toEqual(SAMPLE_TIMELINE);
  });

  it('clear timeline (null) deletes the x-domio:timeline prop key', () => {
    const doc = buildDoc();
    const set = timelineOp(COMP_A, SAMPLE_TIMELINE, undefined, 0);
    const bound = applyOp(doc, set);
    const clear = timelineOp(COMP_A, null, SAMPLE_TIMELINE, 1);
    const cleared = applyOp(bound, clear);
    expect(comp(cleared, COMP_A).component.props).not.toHaveProperty('x-domio:timeline');
  });

  it('revert restores the pre-op props exactly', () => {
    const doc = buildDoc();
    const preProps = { ...comp(doc, COMP_A).component.props };
    const op = timelineOp(COMP_A, SAMPLE_TIMELINE, undefined, 0);
    const applied = applyOp(doc, op);
    const reverted = applyOp(applied, {
      ...op,
      forward: op.inverse,
      inverse: op.forward,
    });
    expect(comp(reverted, COMP_A).component.props).toEqual(preProps);
  });

  it('existing props are preserved when timeline is applied', () => {
    const doc = buildDoc();
    const op = timelineOp(COMP_A, SAMPLE_TIMELINE, undefined, 0);
    const next = applyOp(doc, op);
    const el = comp(next, COMP_A);
    expect(el.component.props['color']).toBe('blue');
    expect(el.component.props['size']).toBe(42);
  });

  it('layer with data-binding keeps it when timeline is applied', () => {
    const doc = buildDoc();
    const bindOp = dataBindingOp(COMP_A, SAMPLE_BINDING, undefined, 0);
    const bound = applyOp(doc, bindOp);
    const tlOp = timelineOp(COMP_A, SAMPLE_TIMELINE, undefined, 1);
    const applied = applyOp(bound, tlOp);
    const el = comp(applied, COMP_A);
    expect(el.component.props['x-domio:binding']).toEqual(SAMPLE_BINDING);
    expect(el.component.props['x-domio:timeline']).toEqual(SAMPLE_TIMELINE);
  });

  it('ops are pure — input layer object is not mutated', () => {
    const doc = buildDoc();
    const originalPropsSnapshot = JSON.stringify(comp(doc, COMP_A).component.props);
    applyOp(doc, timelineOp(COMP_A, SAMPLE_TIMELINE, undefined, 0));
    expect(JSON.stringify(comp(doc, COMP_A).component.props)).toBe(originalPropsSnapshot);
  });

  it('does not affect other component elements', () => {
    const doc = buildDoc();
    const op = timelineOp(COMP_A, SAMPLE_TIMELINE, undefined, 0);
    const next = applyOp(doc, op);
    const elB = comp(next, COMP_B);
    expect(elB.component.props['x-domio:timeline']).toBeUndefined();
    expect(elB.component.props['orientation']).toBe('vertical');
  });
});

// -------------------------------------------------------------------
// TransitionOp
// -------------------------------------------------------------------
describe('TransitionOp', () => {
  it('set transition applies x-domio:transition on the slide', () => {
    const doc = buildDoc();
    const op = transitionOp(SLIDE_ID, SAMPLE_TRANSITION, undefined, 0);
    const next = applyOp(doc, op);
    const slide = next.slides.find((s) => s.id === SLIDE_ID)!;
    expect((slide as unknown as Record<string, unknown>)['x-domio:transition']).toEqual(
      SAMPLE_TRANSITION,
    );
  });

  it('clear transition (null) deletes x-domio:transition from the slide', () => {
    const doc = buildDoc();
    const set = transitionOp(SLIDE_ID, SAMPLE_TRANSITION, undefined, 0);
    const bound = applyOp(doc, set);
    const clear = transitionOp(SLIDE_ID, null, SAMPLE_TRANSITION, 1);
    const cleared = applyOp(bound, clear);
    const slide = cleared.slides.find((s) => s.id === SLIDE_ID)!;
    expect((slide as unknown as Record<string, unknown>)['x-domio:transition']).toBeUndefined();
  });

  it('revert restores the pre-op deck state', () => {
    const doc = buildDoc();
    const op = transitionOp(SLIDE_ID, SAMPLE_TRANSITION, undefined, 0);
    const applied = applyOp(doc, op);
    const reverted = applyOp(applied, {
      ...op,
      forward: op.inverse,
      inverse: op.forward,
    });
    expect(reverted).toEqual(doc);
  });

  it('does not affect other slides', () => {
    const doc = buildDoc();
    const op = transitionOp(SLIDE_ID, SAMPLE_TRANSITION, undefined, 0);
    const next = applyOp(doc, op);
    const otherSlide = next.slides.find((s) => s.id === SLIDE_ID_2)!;
    expect(
      (otherSlide as unknown as Record<string, unknown>)['x-domio:transition'],
    ).toBeUndefined();
  });

  it('ops are pure — input deck is not mutated', () => {
    const doc = buildDoc();
    const originalSnapshot = JSON.stringify(doc);
    applyOp(doc, transitionOp(SLIDE_ID, SAMPLE_TRANSITION, undefined, 0));
    expect(JSON.stringify(doc)).toBe(originalSnapshot);
  });
});

// -------------------------------------------------------------------
// MagicMoveOp
// -------------------------------------------------------------------
describe('MagicMoveOp', () => {
  it('set role applies element_role on the element', () => {
    const doc = buildDoc();
    const op = magicMoveOp(COMP_A, 'hero-card', undefined, 0);
    const next = applyOp(doc, op);
    const el = next.slides[0]!.elements.find((e) => e.id === COMP_A)!;
    expect(el.element_role).toBe('hero-card');
  });

  it('clear role (null) removes element_role from the element', () => {
    const doc = buildDoc();
    const set = magicMoveOp(COMP_A, 'hero-card', undefined, 0);
    const bound = applyOp(doc, set);
    const clear = magicMoveOp(COMP_A, null, 'hero-card', 1);
    const cleared = applyOp(bound, clear);
    const el = cleared.slides[0]!.elements.find((e) => e.id === COMP_A)!;
    expect(el.element_role).toBeUndefined();
  });

  it('revert restores the pre-op element state', () => {
    const doc = buildDoc();
    const op = magicMoveOp(COMP_A, 'hero-card', undefined, 0);
    const applied = applyOp(doc, op);
    const reverted = applyOp(applied, {
      ...op,
      forward: op.inverse,
      inverse: op.forward,
    });
    expect(reverted).toEqual(doc);
  });

  it('does not affect other elements', () => {
    const doc = buildDoc();
    const op = magicMoveOp(COMP_A, 'hero-card', undefined, 0);
    const next = applyOp(doc, op);
    const elB = next.slides[0]!.elements.find((e) => e.id === COMP_B)!;
    expect(elB.element_role).toBeUndefined();
  });

  it('ops are pure — input deck is not mutated', () => {
    const doc = buildDoc();
    const originalSnapshot = JSON.stringify(doc);
    applyOp(doc, magicMoveOp(COMP_A, 'hero-card', undefined, 0));
    expect(JSON.stringify(doc)).toBe(originalSnapshot);
  });

  it('replacing a role overwrites the previous value', () => {
    const doc = buildDoc();
    const set1 = magicMoveOp(COMP_A, 'hero-card', undefined, 0);
    const step1 = applyOp(doc, set1);
    const set2 = magicMoveOp(COMP_A, 'secondary-card', 'hero-card', 1);
    const step2 = applyOp(step1, set2);
    const el = step2.slides[0]!.elements.find((e) => e.id === COMP_A)!;
    expect(el.element_role).toBe('secondary-card');
  });
});

// -------------------------------------------------------------------
// ReducedMotionOp
// -------------------------------------------------------------------
describe('ReducedMotionOp', () => {
  it('set policy applies x-domio:reduced-motion on the deck', () => {
    const doc = buildDoc();
    const op = reducedMotionOp('always_reduced', undefined, 0);
    const next = applyOp(doc, op);
    expect((next as unknown as Record<string, unknown>)['x-domio:reduced-motion']).toBe(
      'always_reduced',
    );
  });

  it('clear policy (null) removes x-domio:reduced-motion from the deck', () => {
    const doc = buildDoc();
    const set = reducedMotionOp('always_reduced', undefined, 0);
    const bound = applyOp(doc, set);
    const clear = reducedMotionOp(null, 'always_reduced', 1);
    const cleared = applyOp(bound, clear);
    expect(
      (cleared as unknown as Record<string, unknown>)['x-domio:reduced-motion'],
    ).toBeUndefined();
  });

  it('revert restores the pre-op deck state', () => {
    const doc = buildDoc();
    const op = reducedMotionOp('always_full', undefined, 0);
    const applied = applyOp(doc, op);
    const reverted = applyOp(applied, {
      ...op,
      forward: op.inverse,
      inverse: op.forward,
    });
    expect(reverted).toEqual(doc);
  });

  it('does not affect other deck properties', () => {
    const doc = buildDoc();
    const op = reducedMotionOp('follow_os', undefined, 0);
    const next = applyOp(doc, op);
    expect(next.title).toBe('Test');
    expect(next.schemaVersion).toBe('1.0.0');
    expect(next.settings).toEqual({ defaultSlideRatio: { ratioW: 16, ratioH: 9 } });
  });

  it('ops are pure — input deck is not mutated', () => {
    const doc = buildDoc();
    const originalSnapshot = JSON.stringify(doc);
    applyOp(doc, reducedMotionOp('always_reduced', undefined, 0));
    expect(JSON.stringify(doc)).toBe(originalSnapshot);
  });

  it('switching policy overwrites the previous value', () => {
    const doc = buildDoc();
    const set1 = reducedMotionOp('always_reduced', undefined, 0);
    const step1 = applyOp(doc, set1);
    const set2 = reducedMotionOp('always_full', 'always_reduced', 1);
    const step2 = applyOp(step1, set2);
    expect((step2 as unknown as Record<string, unknown>)['x-domio:reduced-motion']).toBe(
      'always_full',
    );
  });
});

// -------------------------------------------------------------------
// Composition — multiple ops on the same layer compose independently
// -------------------------------------------------------------------
describe('P09 ops compose independently on the same layer', () => {
  it('TimelineOp, ThresholdOp, and DataBindingOp coexist on one component', () => {
    const doc = buildDoc();

    // 1. Apply a data-binding
    const bindOp = dataBindingOp(COMP_A, SAMPLE_BINDING, undefined, 0);
    const step1 = applyOp(doc, bindOp);

    // 2. Apply thresholds
    const thrOp = thresholdOp(COMP_A, SAMPLE_RULES, undefined, 1);
    const step2 = applyOp(step1, thrOp);

    // 3. Apply a timeline
    const tlOp = timelineOp(COMP_A, SAMPLE_TIMELINE, undefined, 2);
    const step3 = applyOp(step2, tlOp);

    const el = comp(step3, COMP_A);
    expect(el.component.props['x-domio:binding']).toEqual(SAMPLE_BINDING);
    expect(el.component.props['x-domio:thresholds']).toEqual(SAMPLE_RULES);
    expect(el.component.props['x-domio:timeline']).toEqual(SAMPLE_TIMELINE);
    // Original props still present
    expect(el.component.props['color']).toBe('blue');
    expect(el.component.props['size']).toBe(42);

    // 4. Remove the timeline — binding and thresholds survive
    const removeTl = timelineOp(COMP_A, null, SAMPLE_TIMELINE, 3);
    const step4 = applyOp(step3, removeTl);
    const el4 = comp(step4, COMP_A);
    expect(el4.component.props).not.toHaveProperty('x-domio:timeline');
    expect(el4.component.props['x-domio:binding']).toEqual(SAMPLE_BINDING);
    expect(el4.component.props['x-domio:thresholds']).toEqual(SAMPLE_RULES);
  });
});

// ────────────────────────────────────────────────────────────────────────
// P10 prototype ops
// ────────────────────────────────────────────────────────────────────────

const SAMPLE_HOTSPOT = {
  id: 'h1',
  slideId: SLIDE_ID,
  name: 'CTA',
  geometry: { kind: 'rect', x: 0.1, y: 0.1, w: 0.5, h: 0.2 },
  gestureMask: ['click'],
  zIndex: 1,
  targetType: 'slide',
  targetRef: { slideId: SLIDE_ID_2 },
  status: 'ok',
};

const SAMPLE_OVERLAY = {
  id: 'o1',
  slideId: SLIDE_ID,
  type: 'modal',
  sizeStrategy: 'medium',
};

const SAMPLE_EDGE = {
  id: 'e1',
  fromSlideId: SLIDE_ID,
  toSlideId: SLIDE_ID_2,
  name: 'next',
};

const SAMPLE_VARIABLE = {
  id: 'v1',
  deckId: DECK_ID,
  name: 'TIER',
  scope: 'deck',
  type: 'string',
  defaultValue: 'monthly',
};

const SAMPLE_RULE = {
  id: 'r1',
  deckId: DECK_ID,
  name: 'annual tier badge',
  priority: 10,
  conditionSource: '$TIER == "annual"',
};

const SAMPLE_VAR_BINDING = {
  id: 'b1',
  variableId: 'v1',
  targetKind: 'element_prop',
  targetId: COMP_A,
  targetProp: 'text',
};

function slideLevel(doc: DeckDocument, slideId: string): Record<string, unknown> {
  const slide = doc.slides.find((s) => s.id === slideId);
  return slide as unknown as Record<string, unknown>;
}

describe('HotspotOp', () => {
  it('stores hotspot on slide[x-domio:hotspots]', () => {
    const doc = buildDoc();
    const next = applyOp(doc, hotspotOp(SLIDE_ID, SAMPLE_HOTSPOT, null, 0));
    expect(slideLevel(next, SLIDE_ID)['x-domio:hotspots']).toEqual(SAMPLE_HOTSPOT);
  });

  it('round-trip forward + inverse restores previous state', () => {
    const doc = buildDoc();
    const op = hotspotOp(SLIDE_ID, SAMPLE_HOTSPOT, null, 0);
    const withHotspot = applyOp(doc, op);
    const reverted = applyOp(withHotspot, {
      ...op,
      forward: op.inverse,
      inverse: op.forward,
      name: op.name,
      id: op.id,
      timestamp: op.timestamp,
    });
    expect(slideLevel(reverted, SLIDE_ID)).not.toHaveProperty('x-domio:hotspots');
  });

  it('null hotspot removes the field', () => {
    const doc = buildDoc();
    const step1 = applyOp(doc, hotspotOp(SLIDE_ID, SAMPLE_HOTSPOT, null, 0));
    const step2 = applyOp(step1, hotspotOp(SLIDE_ID, null, SAMPLE_HOTSPOT, 1));
    expect(slideLevel(step2, SLIDE_ID)).not.toHaveProperty('x-domio:hotspots');
  });

  it('does not touch other slides', () => {
    const doc = buildDoc();
    const next = applyOp(doc, hotspotOp(SLIDE_ID, SAMPLE_HOTSPOT, null, 0));
    expect(slideLevel(next, SLIDE_ID_2)).not.toHaveProperty('x-domio:hotspots');
  });

  it('op factory names the HistoryOp correctly', () => {
    expect(hotspotOp(SLIDE_ID, SAMPLE_HOTSPOT, null, 0).name).toBe('HotspotOp');
  });
});

describe('OverlayOp', () => {
  it('stores overlay on slide[x-domio:overlays]', () => {
    const next = applyOp(buildDoc(), overlayOp(SLIDE_ID, SAMPLE_OVERLAY, null, 0));
    expect(slideLevel(next, SLIDE_ID)['x-domio:overlays']).toEqual(SAMPLE_OVERLAY);
  });

  it('round-trip restores previous state', () => {
    const doc = buildDoc();
    const op = overlayOp(SLIDE_ID, SAMPLE_OVERLAY, null, 0);
    const withOverlay = applyOp(doc, op);
    const reverted = applyOp(withOverlay, {
      ...op,
      forward: op.inverse,
      inverse: op.forward,
      name: op.name,
      id: op.id,
      timestamp: op.timestamp,
    });
    expect(slideLevel(reverted, SLIDE_ID)).not.toHaveProperty('x-domio:overlays');
  });

  it('op factory names correctly', () => {
    expect(overlayOp(SLIDE_ID, SAMPLE_OVERLAY, null, 0).name).toBe('OverlayOp');
  });
});

describe('BranchingEdgeOp', () => {
  it('stores edge on slide[x-domio:branching-edges]', () => {
    const next = applyOp(buildDoc(), branchingEdgeOp(SLIDE_ID, SAMPLE_EDGE, null, 0));
    expect(slideLevel(next, SLIDE_ID)['x-domio:branching-edges']).toEqual(SAMPLE_EDGE);
  });

  it('round-trip restores previous', () => {
    const doc = buildDoc();
    const op = branchingEdgeOp(SLIDE_ID, SAMPLE_EDGE, null, 0);
    const withEdge = applyOp(doc, op);
    const reverted = applyOp(withEdge, {
      ...op,
      forward: op.inverse,
      inverse: op.forward,
      name: op.name,
      id: op.id,
      timestamp: op.timestamp,
    });
    expect(slideLevel(reverted, SLIDE_ID)).not.toHaveProperty('x-domio:branching-edges');
  });

  it('op factory names correctly', () => {
    expect(branchingEdgeOp(SLIDE_ID, SAMPLE_EDGE, null, 0).name).toBe('BranchingEdgeOp');
  });
});

describe('VariableOp', () => {
  it('stores variable on slide[x-domio:variables]', () => {
    const next = applyOp(buildDoc(), variableOp(SLIDE_ID, SAMPLE_VARIABLE, null, 0));
    expect(slideLevel(next, SLIDE_ID)['x-domio:variables']).toEqual(SAMPLE_VARIABLE);
  });

  it('round-trip restores previous', () => {
    const doc = buildDoc();
    const op = variableOp(SLIDE_ID, SAMPLE_VARIABLE, null, 0);
    const withVar = applyOp(doc, op);
    const reverted = applyOp(withVar, {
      ...op,
      forward: op.inverse,
      inverse: op.forward,
      name: op.name,
      id: op.id,
      timestamp: op.timestamp,
    });
    expect(slideLevel(reverted, SLIDE_ID)).not.toHaveProperty('x-domio:variables');
  });

  it('op factory names correctly', () => {
    expect(variableOp(SLIDE_ID, SAMPLE_VARIABLE, null, 0).name).toBe('VariableOp');
  });
});

describe('ConditionalRuleOp', () => {
  it('stores rule on component.props[x-domio:conditional-rule]', () => {
    const next = applyOp(buildDoc(), conditionalRuleOp(COMP_A, SAMPLE_RULE, null, 0));
    const el = comp(next, COMP_A);
    expect(el.component.props?.['x-domio:conditional-rule']).toEqual(SAMPLE_RULE);
  });

  it('round-trip restores previous', () => {
    const doc = buildDoc();
    const op = conditionalRuleOp(COMP_A, SAMPLE_RULE, null, 0);
    const withRule = applyOp(doc, op);
    const reverted = applyOp(withRule, {
      ...op,
      forward: op.inverse,
      inverse: op.forward,
      name: op.name,
      id: op.id,
      timestamp: op.timestamp,
    });
    expect(comp(reverted, COMP_A).component.props).not.toHaveProperty('x-domio:conditional-rule');
  });

  it('null removes the rule', () => {
    const doc = buildDoc();
    const step1 = applyOp(doc, conditionalRuleOp(COMP_A, SAMPLE_RULE, null, 0));
    const step2 = applyOp(step1, conditionalRuleOp(COMP_A, null, SAMPLE_RULE, 1));
    expect(comp(step2, COMP_A).component.props).not.toHaveProperty('x-domio:conditional-rule');
  });

  it('op factory names correctly', () => {
    expect(conditionalRuleOp(COMP_A, SAMPLE_RULE, null, 0).name).toBe('ConditionalRuleOp');
  });
});

describe('VariableBindingOp', () => {
  it('stores binding on component.props[x-domio:variable-binding]', () => {
    const next = applyOp(buildDoc(), variableBindingOp(COMP_A, SAMPLE_VAR_BINDING, null, 0));
    const el = comp(next, COMP_A);
    expect(el.component.props?.['x-domio:variable-binding']).toEqual(SAMPLE_VAR_BINDING);
  });

  it('round-trip restores previous', () => {
    const doc = buildDoc();
    const op = variableBindingOp(COMP_A, SAMPLE_VAR_BINDING, null, 0);
    const withBinding = applyOp(doc, op);
    const reverted = applyOp(withBinding, {
      ...op,
      forward: op.inverse,
      inverse: op.forward,
      name: op.name,
      id: op.id,
      timestamp: op.timestamp,
    });
    expect(comp(reverted, COMP_A).component.props).not.toHaveProperty('x-domio:variable-binding');
  });

  it('null removes the binding', () => {
    const doc = buildDoc();
    const step1 = applyOp(doc, variableBindingOp(COMP_A, SAMPLE_VAR_BINDING, null, 0));
    const step2 = applyOp(step1, variableBindingOp(COMP_A, null, SAMPLE_VAR_BINDING, 1));
    expect(comp(step2, COMP_A).component.props).not.toHaveProperty('x-domio:variable-binding');
  });

  it('op factory names correctly', () => {
    expect(variableBindingOp(COMP_A, SAMPLE_VAR_BINDING, null, 0).name).toBe('VariableBindingOp');
  });

  it('P10 ops do not collide with existing props', () => {
    const doc = buildDoc();
    const next = applyOp(doc, conditionalRuleOp(COMP_A, SAMPLE_RULE, null, 0));
    // existing props (color, size) preserved
    const el = comp(next, COMP_A);
    expect(el.component.props?.color).toBe('blue');
    expect(el.component.props?.size).toBe(42);
  });
});
