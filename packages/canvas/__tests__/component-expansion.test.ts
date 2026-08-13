/**
 * Renderer normalization for component elements — the scene graph must
 * expand `component` layers via the @domio/components pack into render
 * commands, and honor frame fills painted by component builders.
 */

import { describe, it, expect } from 'vitest';
import { asULID, type DeckDocument } from '@domio/schema';
import { elementToCommand } from '../src/scene/normalize.js';

const ULID = asULID('00000000000000000000000001');

function componentLayer(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: asULID('00000000000000000000000002'),
    semanticId: 'stat1',
    type: 'component' as const,
    name: 'stat1',
    parentId: null,
    transform: { x: 40, y: 60, w: 320, h: 160, rotation: 0 },
    component: {
      catalogId: 'domio.stat-card',
      version: '1.0.0',
      props: { value: 42, label: 'Revenue' },
    },
    ...overrides,
  };
}

describe('elementToCommand for component elements', () => {
  it('expands a known component into a drawGroup of child commands', () => {
    const cmd = elementToCommand(componentLayer() as never);
    expect(cmd).not.toBeNull();
    expect(cmd?.kind).toBe('drawGroup');
    if (cmd?.kind === 'drawGroup') {
      expect(cmd.children.length).toBeGreaterThan(0);
      // Every expanded child is a concrete draw command positioned in
      // the layer box (offset by the component transform).
      const kinds = cmd.children.map((c) => c.kind);
      expect(
        kinds.every((k) => ['drawRect', 'drawText', 'drawPath', 'drawImage'].includes(k)),
      ).toBe(true);
      for (const child of cmd.children) {
        if (child.kind === 'drawRect' || child.kind === 'drawText') {
          expect(child.x).toBeGreaterThanOrEqual(40);
          expect(child.y).toBeGreaterThanOrEqual(60);
        }
      }
    }
  });

  it('returns an empty drawGroup for unknown catalog ids (renderers fall back)', () => {
    const cmd = elementToCommand(
      componentLayer({
        component: { catalogId: 'domio.missing', version: '1.0.0', props: {} },
      }) as never,
    );
    expect(cmd?.kind).toBe('drawGroup');
    if (cmd?.kind === 'drawGroup') {
      expect(cmd.children).toEqual([]);
    }
  });

  it('paints frame fills onto drawRect commands', () => {
    const cmd = elementToCommand({
      id: asULID('00000000000000000000000003'),
      semanticId: 'card',
      type: 'frame' as const,
      name: 'card',
      parentId: null,
      transform: { x: 0, y: 0, w: 100, h: 50, rotation: 0 },
      aspect: { ratioW: 2, ratioH: 1 },
      fill: { type: 'solid', color: { r: 15, g: 23, b: 42, a: 1 } },
    });
    expect(cmd?.kind).toBe('drawRect');
    if (cmd?.kind === 'drawRect') {
      expect(cmd.fill?.value).toBe('rgba(15, 23, 42, 255)');
    }
  });

  it('expands deterministically across calls', () => {
    const a = elementToCommand(componentLayer() as never);
    const b = elementToCommand(componentLayer() as never);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('normalize full decks with components', () => {
  it('normalizes a deck containing a component layer', async () => {
    const { normalize } = await import('../src/scene/normalize.js');
    const { SceneGraph } = await import('../src/scene/scene-graph.js');
    const doc: DeckDocument = {
      schemaVersion: '1.0.0',
      id: ULID,
      tenantId: 'tenant-test',
      workspaceId: ULID,
      title: 'c',
      revision: 1,
      settings: { defaultSlideRatio: { ratioW: 16, ratioH: 9 } },
      slides: [
        {
          id: asULID('00000000000000000000000004'),
          semanticId: 's1',
          position: 0,
          aspect: { ratioW: 16, ratioH: 9 },
          elements: [componentLayer() as never],
        },
      ],
    };
    const graph = new SceneGraph();
    graph.ingest(doc);
    const { commands } = normalize(doc, graph);
    expect(commands).toHaveLength(1);
    const slide = commands[0];
    if (slide.kind === 'drawGroup') {
      expect(slide.children).toHaveLength(1);
      expect(slide.children[0]?.kind).toBe('drawGroup');
    }
  });
});
