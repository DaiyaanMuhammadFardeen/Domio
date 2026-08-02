/**
 * Smart-component ops: PropEditOp + VariantChangeOp forward/inverse
 * symmetry and round-trip through the history engine.
 */

import { describe, it, expect } from 'vitest';
import { asULID, type DeckDocument, type Element } from '@domio/schema';
import { applyOp, propEditOp, variantChangeOp } from '../src/history/ops.js';

const DOC_ID = asULID('00000000000000000000000001');
const SLIDE_ID = asULID('00000000000000000000000002');
const ELEMENT_ID = asULID('00000000000000000000000003');

function baseDoc(): DeckDocument {
  return {
    schemaVersion: '1.0.0',
    id: DOC_ID,
    tenantId: 'tenant-test',
    workspaceId: DOC_ID,
    title: 'ops',
    revision: 1,
    settings: { defaultSlideRatio: { ratioW: 16, ratioH: 9 } },
    slides: [
      {
        id: SLIDE_ID,
        semanticId: 's1',
        position: 0,
        aspect: { ratioW: 16, ratioH: 9 },
        elements: [
          {
            id: ELEMENT_ID,
            semanticId: 'stat1',
            type: 'component',
            name: 'stat1',
            parentId: null,
            transform: { x: 0, y: 0, w: 320, h: 160, rotation: 0 },
            component: { catalogId: 'domio.stat-card', version: '1.0.0', variant: 'light', props: { value: 42, label: 'Revenue' } },
          } as Element,
        ],
      },
    ],
  };
}

describe('PropEditOp', () => {
  it('updates the component props payload', () => {
    const op = propEditOp([{ id: ELEMENT_ID, key: 'value', from: 42, to: 128 }], 1000);
    const next = applyOp(baseDoc(), op);
    const el = next.slides[0]?.elements[0];
    expect(el?.type).toBe('component');
    if (el?.type === 'component') {
      expect(el.component.props).toEqual({ value: 128, label: 'Revenue' });
    }
  });

  it('inverse restores the prior value', () => {
    const op = propEditOp([{ id: ELEMENT_ID, key: 'label', from: 'Revenue', to: 'ARR' }], 1000);
    const next = applyOp(baseDoc(), op);
    const back = applyOp(next, { ...op, forward: op.inverse });
    const el = back.slides[0]?.elements[0];
    if (el?.type === 'component') {
      expect(el.component.props).toEqual({ value: 42, label: 'Revenue' });
    }
  });

  it('ignores non-component elements', () => {
    const doc = baseDoc();
    doc.slides[0]!.elements = [
      {
        id: ELEMENT_ID,
        semanticId: 't1',
        type: 'text',
        name: 't1',
        parentId: null,
        transform: { x: 0, y: 0, w: 100, h: 40, rotation: 0 },
        text: { content: 'hi' },
      } as Element,
    ];
    const op = propEditOp([{ id: ELEMENT_ID, key: 'value', from: 1, to: 2 }], 1000);
    const next = applyOp(doc, op);
    expect(next.slides[0]?.elements[0]).toEqual(doc.slides[0]?.elements[0]);
  });
});

describe('VariantChangeOp', () => {
  it('switches the active variant', () => {
    const op = variantChangeOp([{ id: ELEMENT_ID, from: 'light', to: 'dark' }], 1000);
    const next = applyOp(baseDoc(), op);
    const el = next.slides[0]?.elements[0];
    if (el?.type === 'component') {
      expect(el.component.variant).toBe('dark');
    }
  });

  it('inverse restores the prior variant', () => {
    const op = variantChangeOp([{ id: ELEMENT_ID, from: 'light', to: 'dark' }], 1000);
    const next = applyOp(baseDoc(), op);
    const back = applyOp(next, { ...op, forward: op.inverse });
    const el = back.slides[0]?.elements[0];
    if (el?.type === 'component') {
      expect(el.component.variant).toBe('light');
    }
  });
});
