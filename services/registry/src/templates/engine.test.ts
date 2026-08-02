/**
 * Tests for the template install engine.
 */

import { describe, it, expect } from 'vitest';
import { InMemoryStore } from '../store/memory.js';
import { defaultDeps, type ServiceDeps } from '../deps.js';
import { installTemplate, guidedOrder, applyTemplate } from './engine.js';
import type { Template, TemplatePlaceholder } from '../store/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlaceholder(overrides: Partial<TemplatePlaceholder> & { key: string }): TemplatePlaceholder {
  return {
    id: `ph-${overrides.key}`,
    label: overrides.key,
    kind: 'text',
    required: false,
    ...overrides,
  };
}

function makeTemplate(overrides: Partial<Template> & { id: string }): Template {
  return {
    kind: 'full_deck',
    name: `Template ${overrides.id}`,
    description: '',
    authorId: 'author-1',
    placeholders: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeDeckJson(slides?: unknown[]): Record<string, unknown> {
  return {
    schemaVersion: '1.0',
    id: 'deck-001',
    slides: slides ?? [
      {
        id: 'slide-1',
        semanticId: 'slide[0]',
        position: 0,
        aspect: { ratioW: 1920, ratioH: 1080 },
        elements: [
          {
            id: 'el-1',
            semanticId: 'slide[0].text[title]',
            name: 'title',
            type: 'text',
            parentId: null,
            text: { content: 'Hello {{title}}' },
          },
          {
            id: 'el-2',
            semanticId: 'slide[0].frame[body]',
            name: 'body',
            type: 'frame',
            parentId: null,
            transform: { x: 100, y: 200, w: 800, h: 400 },
            fill: { type: 'solid', color: { r: 255, g: 0, b: 0, a: 1 } },
          },
        ],
      },
    ],
  };
}

async function seedTemplate(
  store: InMemoryStore,
  template: Template,
): Promise<void> {
  await store.putTemplate(template);
}

// ---------------------------------------------------------------------------
// installTemplate
// ---------------------------------------------------------------------------

describe('installTemplate', () => {
  it('replaces a placeholder via binding path', async () => {
    const store = new InMemoryStore();
    const deps: ServiceDeps = defaultDeps(store);

    const template = makeTemplate({
      id: 'tpl-1',
      deckJson: makeDeckJson(),
      placeholders: [
        makePlaceholder({
          key: 'title',
          binding: 'slides[0].elements[0].text.content',
          required: true,
        }),
      ],
    });
    await seedTemplate(store, template);

    const result = await installTemplate(deps, {
      templateId: 'tpl-1',
      workspaceId: 'ws-1',
      userId: 'user-1',
      values: { title: 'My Slide Title' },
    });

    expect(result.deck).toBeDefined();
    expect(result.manifest).toHaveLength(1);
    expect(result.manifest[0]!.key).toBe('title');
    expect(result.manifest[0]!.value).toBe('My Slide Title');
  });

  it('uses placeholder default when value not provided', async () => {
    const store = new InMemoryStore();
    const deps: ServiceDeps = defaultDeps(store);

    const template = makeTemplate({
      id: 'tpl-2',
      deckJson: makeDeckJson(),
      placeholders: [
        makePlaceholder({
          key: 'title',
          binding: 'slides[0].elements[0].text.content',
          required: false,
          default: 'Default Title',
        }),
      ],
    });
    await seedTemplate(store, template);

    const result = await installTemplate(deps, {
      templateId: 'tpl-2',
      workspaceId: 'ws-1',
      userId: 'user-1',
      values: {},
    });

    expect(result.manifest).toHaveLength(1);
    expect(result.manifest[0]!.value).toBe('Default Title');
  });

  it('throws ERR_VALIDATION for missing required placeholder with no default', async () => {
    const store = new InMemoryStore();
    const deps: ServiceDeps = defaultDeps(store);

    const template = makeTemplate({
      id: 'tpl-3',
      deckJson: makeDeckJson(),
      placeholders: [
        makePlaceholder({
          key: 'title',
          binding: 'slides[0].elements[0].props.label',
          required: true,
        }),
      ],
    });
    await seedTemplate(store, template);

    await expect(
      installTemplate(deps, {
        templateId: 'tpl-3',
        workspaceId: 'ws-1',
        userId: 'user-1',
        values: {},
      }),
    ).rejects.toThrow(/Required placeholder "title"/);
  });

  it('throws ERR_VALIDATION when binding path cannot be resolved', async () => {
    const store = new InMemoryStore();
    const deps: ServiceDeps = defaultDeps(store);

    const template = makeTemplate({
      id: 'tpl-4',
      deckJson: makeDeckJson(),
      placeholders: [
        makePlaceholder({
          key: 'title',
          binding: 'slides[99].elements[0].props.label',
          required: true,
        }),
      ],
    });
    await seedTemplate(store, template);

    await expect(
      installTemplate(deps, {
        templateId: 'tpl-4',
        workspaceId: 'ws-1',
        userId: 'user-1',
        values: { title: 'Hello' },
      }),
    ).rejects.toThrow(/Cannot resolve binding/);
  });

  it('throws ERR_NOT_FOUND for missing template', async () => {
    const store = new InMemoryStore();
    const deps: ServiceDeps = defaultDeps(store);

    await expect(
      installTemplate(deps, {
        templateId: 'nonexistent',
        workspaceId: 'ws-1',
        userId: 'user-1',
        values: {},
      }),
    ).rejects.toThrow(/not found/);
  });

  it('returns deep-copied deck — mutating result does not affect original', async () => {
    const store = new InMemoryStore();
    const deps: ServiceDeps = defaultDeps(store);

    const originalDeck = makeDeckJson();
    const template = makeTemplate({
      id: 'tpl-5',
      deckJson: originalDeck,
      placeholders: [],
    });
    await seedTemplate(store, template);

    const result = await installTemplate(deps, {
      templateId: 'tpl-5',
      workspaceId: 'ws-1',
      userId: 'user-1',
      values: {},
    });

    // Mutate the result
    (result.deck as Record<string, unknown>).title = 'mutated';

    // The original deck in the store should be unaffected
    const stored = await store.getTemplate('tpl-5');
    expect(stored!.deckJson).toEqual(originalDeck);
    expect((stored!.deckJson as Record<string, unknown>).title).toBeUndefined();
  });

  it('applies multiple placeholders in order', async () => {
    const store = new InMemoryStore();
    const deps: ServiceDeps = defaultDeps(store);

    const template = makeTemplate({
      id: 'tpl-6',
      deckJson: makeDeckJson([
        {
          id: 'slide-1',
          semanticId: 'slide[0]',
          position: 0,
          aspect: { ratioW: 1920, ratioH: 1080 },
          elements: [
            {
              id: 'el-1',
              semanticId: 'slide[0].text[title]',
              name: 'title',
              type: 'text',
              parentId: null,
              text: { content: 'placeholder' },
            },
            {
              id: 'el-2',
              semanticId: 'slide[0].frame[bg]',
              name: 'bg',
              type: 'frame',
              parentId: null,
              transform: { x: 0, y: 0, w: 1920, h: 1080 },
              fill: { type: 'solid', color: { r: 255, g: 255, b: 255, a: 1 } },
            },
          ],
        },
      ]),
      placeholders: [
        makePlaceholder({
          key: 'title',
          binding: 'slides[0].elements[0].text.content',
          required: true,
        }),
        makePlaceholder({
          key: 'bgColor',
          binding: 'slides[0].elements[1].fill.color.r',
          kind: 'number',
          required: false,
          default: 0,
        }),
      ],
    });
    await seedTemplate(store, template);

    const result = await installTemplate(deps, {
      templateId: 'tpl-6',
      workspaceId: 'ws-1',
      userId: 'user-1',
      values: { title: 'My Title', bgColor: 200 },
    });

    expect(result.manifest).toHaveLength(2);
    expect(result.manifest[0]!.key).toBe('title');
    expect(result.manifest[1]!.key).toBe('bgColor');
  });
});

// ---------------------------------------------------------------------------
// guidedOrder
// ---------------------------------------------------------------------------

describe('guidedOrder', () => {
  it('returns required placeholders first, then optional', async () => {
    const store = new InMemoryStore();
    const deps: ServiceDeps = defaultDeps(store);

    const template = makeTemplate({
      id: 'tpl-order-1',
      placeholders: [
        makePlaceholder({ key: 'opt1', required: false }),
        makePlaceholder({ key: 'req1', required: true }),
        makePlaceholder({ key: 'opt2', required: false }),
        makePlaceholder({ key: 'req2', required: true }),
      ],
    });
    await seedTemplate(store, template);

    const result = await guidedOrder(deps, 'tpl-order-1');

    expect(result.map((p) => p.key)).toEqual(['req1', 'req2', 'opt1', 'opt2']);
  });

  it('preserves declared order within required and optional groups', async () => {
    const store = new InMemoryStore();
    const deps: ServiceDeps = defaultDeps(store);

    const template = makeTemplate({
      id: 'tpl-order-2',
      placeholders: [
        makePlaceholder({ key: 'b-req', required: true }),
        makePlaceholder({ key: 'a-req', required: true }),
        makePlaceholder({ key: 'b-opt', required: false }),
        makePlaceholder({ key: 'a-opt', required: false }),
      ],
    });
    await seedTemplate(store, template);

    const result = await guidedOrder(deps, 'tpl-order-2');

    expect(result.map((p) => p.key)).toEqual(['b-req', 'a-req', 'b-opt', 'a-opt']);
  });

  it('throws ERR_NOT_FOUND for missing template', async () => {
    const store = new InMemoryStore();
    const deps: ServiceDeps = defaultDeps(store);

    await expect(guidedOrder(deps, 'nonexistent')).rejects.toThrow(/not found/);
  });
});

// ---------------------------------------------------------------------------
// applyTemplate (alias)
// ---------------------------------------------------------------------------

describe('applyTemplate', () => {
  it('returns the same result shape as installTemplate', async () => {
    const store = new InMemoryStore();
    const deps: ServiceDeps = defaultDeps(store);

    const template = makeTemplate({
      id: 'tpl-apply-1',
      deckJson: makeDeckJson(),
      placeholders: [
        makePlaceholder({
          key: 'title',
          binding: 'slides[0].elements[0].text.content',
          required: false,
          default: 'Default',
        }),
      ],
    });
    await seedTemplate(store, template);

    const result = await applyTemplate(deps, {
      templateId: 'tpl-apply-1',
      workspaceId: 'ws-1',
      userId: 'user-1',
      values: {},
    });

    expect(result).toHaveProperty('deck');
    expect(result).toHaveProperty('manifest');
    expect(result.manifest).toHaveLength(1);
  });
});
