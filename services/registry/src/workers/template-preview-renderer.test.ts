/**
 * Tests for the template preview renderer worker.
 */

import { describe, it, expect } from 'vitest';
import { InMemoryStore } from '../store/memory.js';
import { defaultDeps, type ServiceDeps } from '../deps.js';
import { run } from './template-preview-renderer.js';
import type { Template } from '../store/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
            text: { content: 'Welcome' },
          },
          {
            id: 'el-2',
            semanticId: 'slide[0].frame[body]',
            name: 'body',
            type: 'frame',
            parentId: null,
            transform: { x: 100, y: 200, w: 800, h: 400 },
          },
        ],
      },
    ],
  };
}

async function seedTemplate(store: InMemoryStore, template: Template): Promise<void> {
  await store.putTemplate(template);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('template-preview-renderer worker', () => {
  it('returns poster SVG + frames spec for a multi-slide template', async () => {
    const store = new InMemoryStore();
    const deps: ServiceDeps = defaultDeps(store);

    const template = makeTemplate({
      id: 'tpl-preview-1',
      deckJson: makeDeckJson([
        {
          id: 'slide-1',
          semanticId: 'slide[0]',
          position: 0,
          aspect: { ratioW: 1920, ratioH: 1080 },
          elements: [
            { id: 'el-1', semanticId: 'slide[0].text[t1]', name: 't1', type: 'text', parentId: null, text: { content: 'Slide 1' } },
          ],
        },
        {
          id: 'slide-2',
          semanticId: 'slide[1]',
          position: 1,
          aspect: { ratioW: 1920, ratioH: 1080 },
          elements: [
            { id: 'el-2', semanticId: 'slide[1].text[t2]', name: 't2', type: 'text', parentId: null, text: { content: 'Slide 2' } },
          ],
        },
      ]),
    });
    await seedTemplate(store, template);

    const result = await run(deps, { templateId: 'tpl-preview-1' });

    expect(result.svg).toBeTruthy();
    expect(result.svg).toContain('<svg');
    expect(result.frames).toHaveLength(2);
    expect(result.frames[0]!.slideIndex).toBe(0);
    expect(result.frames[0]!.durationMs).toBe(5000);
    expect(result.frames[1]!.slideIndex).toBe(1);
    expect(result.placeholderCount).toBe(2);
    expect(result.width).toBe(1920);
  });

  it('returns slides output kind', async () => {
    const store = new InMemoryStore();
    const deps: ServiceDeps = defaultDeps(store);

    const template = makeTemplate({
      id: 'tpl-preview-slides',
      deckJson: makeDeckJson([
        {
          id: 'slide-1',
          semanticId: 'slide[0]',
          position: 0,
          aspect: { ratioW: 1920, ratioH: 1080 },
          elements: [
            { id: 'el-1', semanticId: 'slide[0].text[t1]', name: 't1', type: 'text', parentId: null, text: { content: 'Slide 1' } },
          ],
        },
        {
          id: 'slide-2',
          semanticId: 'slide[1]',
          position: 1,
          aspect: { ratioW: 1920, ratioH: 1080 },
          elements: [
            { id: 'el-2', semanticId: 'slide[1].text[t2]', name: 't2', type: 'text', parentId: null, text: { content: 'Slide 2' } },
          ],
        },
      ]),
    });
    await seedTemplate(store, template);

    const result = await run(deps, { templateId: 'tpl-preview-slides', outputKind: 'slides' });

    expect(result.frames).toHaveLength(2);
    expect(result.svg).toContain('<svg');
  });

  it('throws for missing template', async () => {
    const store = new InMemoryStore();
    const deps: ServiceDeps = defaultDeps(store);

    await expect(run(deps, { templateId: 'nonexistent' })).rejects.toThrow(/not found/);
  });

  it('throws for template with no deckJson', async () => {
    const store = new InMemoryStore();
    const deps: ServiceDeps = defaultDeps(store);

    // Create template without deckJson by using a separate put call
    const base = makeTemplate({ id: 'tpl-no-deck' });
    // Remove deckJson by casting (this simulates a template stored without deckJson)
    const templateWithoutDeck = { ...base } as Template & { deckJson?: Record<string, unknown> };
    delete templateWithoutDeck.deckJson;
    await store.putTemplate(templateWithoutDeck as Template);

    await expect(run(deps, { templateId: 'tpl-no-deck' })).rejects.toThrow(/no deckJson/);
  });

  it('defaults to poster output kind', async () => {
    const store = new InMemoryStore();
    const deps: ServiceDeps = defaultDeps(store);

    const template = makeTemplate({
      id: 'tpl-default',
      deckJson: makeDeckJson([
        {
          id: 'slide-1',
          semanticId: 'slide[0]',
          position: 0,
          aspect: { ratioW: 1920, ratioH: 1080 },
          elements: [
            { id: 'el-1', semanticId: 'slide[0].text[t1]', name: 't1', type: 'text', parentId: null, text: { content: 'Hello' } },
          ],
        },
      ]),
    });
    await seedTemplate(store, template);

    const result = await run(deps, { templateId: 'tpl-default' });

    // Poster should contain all slides stacked
    expect(result.frames).toHaveLength(1);
    expect(result.svg).toContain('<svg');
  });
});
