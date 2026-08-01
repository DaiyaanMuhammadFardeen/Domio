/**
 * Sub-document registry for Yjs deck/slide/theme CRDTs.
 *
 * Each slide in a deck lives in its own Y.Doc (sub-document) so that
 * concurrent edits to different slides don't create unnecessary merge
 * conflicts. The registry owns the mapping from semantic slide IDs to
 * their Y.Doc instances and provides schema↔CRDT projection helpers.
 *
 * ## Serialization lossiness notes
 *
 * `serializeSlide` projects CRDT state back to a `Slide` object. The
 * round-trip is faithful for:
 *   - element ids, semantic ids, names, types, parentId
 *   - element ordering (via zOrder RGA position → `z` numeric value)
 *   - transform (x, y, w, h, rotation, scale)
 *   - text content for TextLayer elements
 *
 * Fields that are **lossy or dropped**:
 *   - `style` bag: only primitive values survive; nested objects lose shape
 *   - Numeric precision: Y.Text stores strings, so numeric content in
 *     `style` may round-trip through JSON parse/stringify
 *   - `unknown` extra fields beyond the schema shape are preserved as-is
 *     in the `style` bag but may lose TypeScript structural guarantees
 *   - `aspect` is stored as a Y.Map but numeric precision is IEEE 754
 *     double — no loss for typical aspect ratios
 */

import * as Y from 'yjs';
import type { Slide, Element, ULID } from '@domio/schema';

// ----- SubDocRegistry -----

/** Metadata envelope stored alongside each sub-doc in the parent. */
interface SubDocMeta {
  docId: string;
  kind: 'slide' | 'deckRoot' | 'theme';
}

/**
 * Manages the lifecycle of slide sub-documents within a parent deck doc.
 *
 * Usage:
 * ```ts
 * const registry = new SubDocRegistry(deckDoc);
 * const slideDoc = registry.getOrCreateSlide('intro');
 * ```
 */
export class SubDocRegistry {
  private readonly subdocsMap: Y.Map<SubDocMeta>;
  /** Semantic key → Y.Doc cache (not persisted — rebuilt on access). */
  private readonly cache = new Map<string, Y.Doc>();

  constructor(parent: Y.Doc) {
    this.subdocsMap = parent.getMap('subdocs');
  }

  /** Return the sub-doc for `key`, creating it if it doesn't exist. */
  getOrCreate(key: string, kind: SubDocMeta['kind'] = 'slide'): Y.Doc {
    const cached = this.cache.get(key);
    if (cached) return cached;

    const existingMeta = this.subdocsMap.get(key) as SubDocMeta | undefined;
    const docId = existingMeta?.docId ?? Y.encodeStateVector(new Y.Doc()).toString();

    const subDoc = new Y.Doc({ guid: docId });
    this.cache.set(key, subDoc);

    if (!existingMeta) {
      this.subdocsMap.set(key, { docId: subDoc.guid, kind });
    }

    return subDoc;
  }

  /** Convenience: get or create a slide sub-doc. */
  getOrCreateSlide(slideKey: string): Y.Doc {
    return this.getOrCreate(slideKey, 'slide');
  }

  /** Get the deck root sub-doc. */
  getOrCreateDeckRoot(deckKey: string): Y.Doc {
    return this.getOrCreate(deckKey, 'deckRoot');
  }

  /** Get a theme sub-doc. */
  getOrCreateTheme(themeKey: string): Y.Doc {
    return this.getOrCreate(themeKey, 'theme');
  }

  /** Return a sub-doc if it exists, else undefined. */
  get(key: string): Y.Doc | undefined {
    return this.cache.get(key);
  }

  /** Check whether a sub-doc has been created for `key`. */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /** Return all registered keys. */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /** Remove a sub-doc and its metadata. Does NOT destroy the Y.Doc. */
  delete(key: string): boolean {
    this.cache.delete(key);
    const existed = this.subdocsMap.has(key);
    this.subdocsMap.delete(key);
    return existed;
  }

  /** Return the raw Y.Map for advanced consumers. */
  getMap(): Y.Map<SubDocMeta> {
    return this.subdocsMap;
  }
}

// ----- CRDT ↔ Schema projection helpers -----

/**
 * Seed a Y.Doc from a schema `Slide` object.
 *
 * Populates:
 * - `meta` map with `id`, `semanticId`, `position`, `title`, `notes`
 * - `aspect` map with `ratioW`, `ratioH`
 * - `elements` Y.Array of element id strings
 * - Per-element `elementProps` Y.Map keyed by element id
 * - Per-text-element `text:{id}` Y.Text for live editing
 * - `zOrder` Y.Array storing element ids in render order (RGA)
 */
export function ensureSlide(doc: Y.Doc, slide: Slide): void {
  const meta = doc.getMap('meta');
  if (meta.size > 0) return; // already seeded

  meta.set('id', slide.id as string);
  meta.set('semanticId', slide.semanticId);
  meta.set('position', slide.position);
  if (slide.title !== undefined) meta.set('title', slide.title);
  if (slide.notes !== undefined) meta.set('notes', slide.notes);

  const aspect = doc.getMap('aspect');
  aspect.set('ratioW', slide.aspect.ratioW);
  aspect.set('ratioH', slide.aspect.ratioH);

  const elements = doc.getArray<Y.XmlFragment | string>('elements');
  const zOrder = doc.getArray<string>('zOrder');
  const elementProps = doc.getMap<Y.Map<unknown>>('elementProps');

  for (const el of slide.elements) {
    elements.push([el.id as string]);

    // Create element props map
    const propsMap = new Y.Map<unknown>();
    propsMap.set('id', el.id as string);
    propsMap.set('semanticId', el.semanticId);
    propsMap.set('name', el.name);
    propsMap.set('type', el.type);
    propsMap.set('parentId', (el.parentId as string) ?? null);
    if (el.transform !== undefined) {
      propsMap.set('transform', {
        x: el.transform.x,
        y: el.transform.y,
        w: el.transform.w,
        h: el.transform.h,
        ...(el.transform.rotation !== undefined ? { rotation: el.transform.rotation } : {}),
        ...(el.transform.scale !== undefined ? { scale: el.transform.scale } : {}),
      });
    }
    if (el.z !== undefined) propsMap.set('z', el.z);
    if (el.locked !== undefined) propsMap.set('locked', el.locked);
    if (el.hidden !== undefined) propsMap.set('hidden', el.hidden);

    // Store text content for text elements
    if (el.type === 'text' && 'text' in el) {
      const textEl = el as { text: { content: string } };
      const textFragment = doc.getText(`text:${el.id}`);
      textFragment.insert(0, textEl.text.content);
    }

    elementProps.set(el.id as string, propsMap);

    // zOrder tracks render order — insert in array order (position = zOrder index)
    zOrder.push([el.id as string]);
  }
}

/**
 * Project a seeded Y.Doc back to a `Slide` schema object.
 *
 * Returns `null` if the doc has not been seeded (meta is empty).
 */
export function serializeSlide(doc: Y.Doc): Slide | null {
  const meta = doc.getMap('meta');
  if (meta.size === 0) return null;

  const aspect = doc.getMap('aspect');
  const zOrder = doc.getArray<string>('zOrder');
  const elementProps = doc.getMap<Y.Map<unknown>>('elementProps');

  const slideId = meta.get('id') as string as ULID;
  const position = (meta.get('position') as number) ?? 0;

  // Build element list in zOrder
  const elements: Element[] = [];
  for (let i = 0; i < zOrder.length; i++) {
    const elId = zOrder.get(i);
    const props = elementProps.get(elId);
    if (!props) continue;

    const base = {
      id: elId as ULID,
      semanticId: (props.get('semanticId') as string) ?? '',
      name: (props.get('name') as string) ?? '',
      parentId: (props.get('parentId') as string | null) as ULID | null,
      z: i, // zOrder position becomes the z value
    };

    const type = props.get('type') as string;
    const transform = props.get('transform') as
      | { x: number; y: number; w: number; h: number; rotation?: number; scale?: number }
      | undefined;

    const locked = props.get('locked') as boolean | undefined;
    const hidden = props.get('hidden') as boolean | undefined;

    const elementBase = {
      ...base,
      ...(transform !== undefined ? { transform } : {}),
      ...(locked !== undefined ? { locked } : {}),
      ...(hidden !== undefined ? { hidden } : {}),
    };

    if (type === 'text') {
      const textFragment = doc.getText(`text:${elId}`);
      elements.push({
        ...elementBase,
        type: 'text',
        text: { content: textFragment.toString() },
      } as Element);
    } else {
      elements.push({
        ...elementBase,
        type: type as Element['type'],
      } as Element);
    }
  }

  const title = meta.get('title') as string | undefined;
  const notes = meta.get('notes') as string | undefined;

  return {
    id: slideId,
    semanticId: (meta.get('semanticId') as string) ?? '',
    position,
    aspect: {
      ratioW: (aspect.get('ratioW') as number) ?? 16,
      ratioH: (aspect.get('ratioH') as number) ?? 9,
    },
    elements,
    ...(title !== undefined ? { title } : {}),
    ...(notes !== undefined ? { notes } : {}),
  } satisfies Slide;
}

/**
 * Convenience: create a deck root doc and populate it with slide sub-docs.
 *
 * Returns:
 * - `deckRoot` — the parent Y.Doc (with a SubDocRegistry for later access)
 * - `slideDocs` — Map from slide semanticId to the seeded Y.Doc
 * - `themeDocs` — Map (empty placeholder for Phase 07)
 */
export function createDeckDocs(
  deckId: string,
  slides: Slide[],
): {
  deckRoot: Y.Doc;
  slideDocs: Map<string, Y.Doc>;
  themeDocs: Map<string, Y.Doc>;
} {
  const deckRoot = new Y.Doc({ guid: deckId });
  const registry = new SubDocRegistry(deckRoot);

  const slideDocs = new Map<string, Y.Doc>();
  for (const slide of slides) {
    const slideDoc = registry.getOrCreateSlide(slide.semanticId);
    ensureSlide(slideDoc, slide);
    slideDocs.set(slide.semanticId, slideDoc);
  }

  return { deckRoot, slideDocs, themeDocs: new Map() };
}
