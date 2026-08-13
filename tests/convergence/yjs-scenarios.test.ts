/**
 * Phase 04 — Convergence scenario corpus for Yjs CRDT operations.
 *
 * Generates 200+ deterministic concurrent-edit scripts across 7 categories,
 * runs each over 100 seeds (mulberry32 PRNG), and asserts byte-equal
 * convergence via Y.encodeStateAsUpdate / Y.encodeStateVector equality.
 *
 * Run: VITEST_WORKSPACE=1 npx vitest run --config vitest.config.ts tests/convergence/yjs-scenarios.test.ts
 */

import { describe, it, expect, afterAll } from 'vitest';
// yjs is not hoisted to repo root by pnpm strict mode — import via
// yjs-shared's node_modules.  If vitest resolves 'yjs' natively you
// can switch back to the bare specifier.
import * as Y from '../../packages/yjs-shared/node_modules/yjs';
import {
  encodeAwarenessUpdate,
  applyAwarenessUpdate,
} from '../../packages/yjs-shared/node_modules/y-protocols/awareness.js';
import {
  SubDocRegistry,
  ensureSlide,
  createDeckDocs,
  createAwareness,
  updatePresence,
  getPeers,
} from '@domio/yjs-shared';
import type { PresenceState } from '@domio/yjs-shared';
import type { Slide, ULID, Element } from '@domio/schema';

// ─── Seeded PRNG (mulberry32) ────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────

function ulid(v: string): ULID {
  return v as ULID;
}

function rngInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function rngPick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

/** Create a fresh element id string. */
function makeElId(rng: () => number): string {
  return `el-${rngInt(rng, 10000, 99999)}`;
}

/** Create a minimal slide doc with n elements. */
function makeSlideDoc(
  doc: Y.Doc,
  semanticId: string,
  elementCount: number,
  rng: () => number,
): void {
  const elements: Element[] = [];
  for (let i = 0; i < elementCount; i++) {
    const id = makeElId(rng);
    const type = rngPick(rng, ['frame', 'group', 'text', 'image'] as const);
    if (type === 'text') {
      elements.push({
        id: ulid(id),
        semanticId: `text-${i}`,
        name: `Element ${i}`,
        type: 'text',
        parentId: null,
        transform: { x: i * 10, y: 0, w: 100, h: 40 },
        text: { content: `Hello ${i}` },
      });
    } else if (type === 'image') {
      elements.push({
        id: ulid(id),
        semanticId: `img-${i}`,
        name: `Element ${i}`,
        type: 'image',
        parentId: null,
        transform: { x: i * 10, y: 0, w: 200, h: 150 },
        assetId: `asset-${i}`,
      });
    } else {
      elements.push({
        id: ulid(id),
        semanticId: `${type}-${i}`,
        name: `Element ${i}`,
        type,
        parentId: null,
        transform: { x: i * 10, y: 0, w: 100, h: 100 },
      });
    }
  }

  const slide: Slide = {
    id: ulid(`slide-${semanticId}`),
    semanticId,
    position: 0,
    aspect: { ratioW: 16, ratioH: 9 },
    elements,
    title: `Slide ${semanticId}`,
  };

  ensureSlide(doc, slide);
}

/** Create a minimal slide doc from explicit element ids. */
function makeSlideDocFromIds(doc: Y.Doc, semanticId: string, elIds: string[]): void {
  const elements: Element[] = elIds.map((id, i) => ({
    id: ulid(id),
    semanticId: `el-${i}`,
    name: `Element ${i}`,
    type: 'frame' as const,
    parentId: null,
    transform: { x: i * 10, y: 0, w: 100, h: 100 },
  }));

  const slide: Slide = {
    id: ulid(`slide-${semanticId}`),
    semanticId,
    position: 0,
    aspect: { ratioW: 16, ratioH: 9 },
    elements,
    title: `Slide ${semanticId}`,
  };

  ensureSlide(doc, slide);
}

/** Sync two docs bidirectionally. */
function syncBidirectional(a: Y.Doc, b: Y.Doc): void {
  const updateA = Y.encodeStateAsUpdate(a);
  const updateB = Y.encodeStateAsUpdate(b);
  Y.applyUpdate(b, updateA);
  Y.applyUpdate(a, updateB);
}

/** Assert two docs have converged. */
function assertConverged(a: Y.Doc, b: Y.Doc, _label: string): void {
  const svA = Y.encodeStateVector(a);
  const svB = Y.encodeStateVector(b);
  expect(svA).toEqual(svB);

  const stateA = Y.encodeStateAsUpdate(a);
  const stateB = Y.encodeStateAsUpdate(b);
  expect(stateA).toEqual(stateB);
}

/** Sync three docs pairwise and assert convergence. */
function syncThreeAndAssert(a: Y.Doc, b: Y.Doc, c: Y.Doc): void {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  Y.applyUpdate(c, Y.encodeStateAsUpdate(a));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
  Y.applyUpdate(c, Y.encodeStateAsUpdate(b));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(c));
  Y.applyUpdate(b, Y.encodeStateAsUpdate(c));

  const svA = Y.encodeStateVector(a);
  const svB = Y.encodeStateVector(b);
  const svC = Y.encodeStateVector(c);
  expect(svA).toEqual(svB);
  expect(svB).toEqual(svC);

  const stateA = Y.encodeStateAsUpdate(a);
  const stateB = Y.encodeStateAsUpdate(b);
  const stateC = Y.encodeStateAsUpdate(c);
  expect(stateA).toEqual(stateB);
  expect(stateB).toEqual(stateC);
}

/** Simple deterministic hash for a string → positive integer. */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ─── Scenario Types ──────────────────────────────────────────────────

interface Scenario {
  id: string;
  category: string;
  /** Build initial state in both docs. */
  setup: (docA: Y.Doc, docB: Y.Doc, rng: () => number) => void;
  /** Apply concurrent edits to doc A. */
  editA: (docA: Y.Doc, rng: () => number) => void;
  /** Apply concurrent edits to doc B. */
  editB: (docB: Y.Doc, rng: () => number) => void;
}

// ─── Scenario Generators ─────────────────────────────────────────────

function generateScenarios(): Scenario[] {
  const scenarios: Scenario[] = [];
  let id = 0;

  // ── Category 1a: Concurrent property edits — different props, same element ──
  for (let i = 0; i < 30; i++) {
    const num = id++;
    scenarios.push({
      id: `prop-diff-${num}`,
      category: 'concurrent-property-edits',
      setup(docA, docB, rng) {
        const elId = makeElId(rng);
        makeSlideDocFromIds(docA, `s-${num}`, [elId]);
        makeSlideDocFromIds(docB, `s-${num}`, [elId]);
        syncBidirectional(docA, docB);
      },
      editA(docA, rng) {
        const map = docA.getMap<Y.Map<unknown>>('elementProps');
        const elId = map.keys().next().value;
        if (!elId) return;
        const props = map.get(elId);
        if (!props) return;
        props.set('name', `name-A-${rngInt(rng, 0, 999)}`);
      },
      editB(docB, rng) {
        const map = docB.getMap<Y.Map<unknown>>('elementProps');
        const elId = map.keys().next().value;
        if (!elId) return;
        const props = map.get(elId);
        if (!props) return;
        props.set('transform', { x: rngInt(rng, 0, 500), y: 0, w: 100, h: 100 });
      },
    });
  }

  // ── Category 1b: Concurrent property edits — same prop, different elements ──
  for (let i = 0; i < 30; i++) {
    const num = id++;
    scenarios.push({
      id: `prop-same-diff-el-${num}`,
      category: 'concurrent-property-edits',
      setup(docA, docB, rng) {
        const el1 = makeElId(rng);
        const el2 = makeElId(rng);
        makeSlideDocFromIds(docA, `s-${num}`, [el1, el2]);
        makeSlideDocFromIds(docB, `s-${num}`, [el1, el2]);
        syncBidirectional(docA, docB);
      },
      editA(docA, rng) {
        const map = docA.getMap<Y.Map<unknown>>('elementProps');
        const keys = Array.from(map.keys());
        if (keys.length < 1) return;
        const props = map.get(keys[0]!);
        if (!props) return;
        props.set('name', `renamed-by-A-${rngInt(rng, 0, 999)}`);
      },
      editB(docB, rng) {
        const map = docB.getMap<Y.Map<unknown>>('elementProps');
        const keys = Array.from(map.keys());
        if (keys.length < 2) return;
        const props = map.get(keys[1]!);
        if (!props) return;
        props.set('name', `renamed-by-B-${rngInt(rng, 0, 999)}`);
      },
    });
  }

  // ── Category 1c: Concurrent property edits — same prop, same element (LWW) ──
  for (let i = 0; i < 30; i++) {
    const num = id++;
    scenarios.push({
      id: `prop-same-same-el-${num}`,
      category: 'concurrent-property-edits',
      setup(docA, docB, rng) {
        const elId = makeElId(rng);
        makeSlideDocFromIds(docA, `s-${num}`, [elId]);
        makeSlideDocFromIds(docB, `s-${num}`, [elId]);
        syncBidirectional(docA, docB);
      },
      editA(docA) {
        const map = docA.getMap<Y.Map<unknown>>('elementProps');
        const elId = map.keys().next().value;
        if (!elId) return;
        const props = map.get(elId);
        if (!props) return;
        props.set('locked', true);
      },
      editB(docB) {
        const map = docB.getMap<Y.Map<unknown>>('elementProps');
        const elId = map.keys().next().value;
        if (!elId) return;
        const props = map.get(elId);
        if (!props) return;
        props.set('locked', false);
      },
    });
  }

  // ── Category 2: Concurrent reorders — element z-order moves ──
  for (let i = 0; i < 30; i++) {
    const num = id++;
    scenarios.push({
      id: `reorder-${num}`,
      category: 'concurrent-reorders',
      setup(docA, docB, rng) {
        const ids = Array.from({ length: 5 }, () => makeElId(rng));
        makeSlideDocFromIds(docA, `s-${num}`, ids);
        makeSlideDocFromIds(docB, `s-${num}`, ids);
        syncBidirectional(docA, docB);
      },
      editA(docA, rng) {
        const zOrder = docA.getArray<string>('zOrder');
        if (zOrder.length < 2) return;
        const from = rngInt(rng, 0, zOrder.length - 1);
        let to = rngInt(rng, 0, zOrder.length - 1);
        if (from === to) to = (to + 1) % zOrder.length;
        const item = zOrder.get(from)!;
        zOrder.delete(from, 1);
        const insertAt = to > from ? to - 1 : to;
        zOrder.insert(Math.max(0, insertAt), [item]);
      },
      editB(docB, rng) {
        const zOrder = docB.getArray<string>('zOrder');
        if (zOrder.length < 2) return;
        const from = rngInt(rng, 0, zOrder.length - 1);
        let to = rngInt(rng, 0, zOrder.length - 1);
        if (from === to) to = (to + 1) % zOrder.length;
        const item = zOrder.get(from)!;
        zOrder.delete(from, 1);
        const insertAt = to > from ? to - 1 : to;
        zOrder.insert(Math.max(0, insertAt), [item]);
      },
    });
  }

  // ── Category 2b: Concurrent reorders — slide reorder on deck root ──
  for (let i = 0; i < 30; i++) {
    const num = id++;
    scenarios.push({
      id: `slide-reorder-${num}`,
      category: 'concurrent-reorders',
      setup(docA, docB) {
        const slidesA = docA.getArray<string>('slides');
        const slidesB = docB.getArray<string>('slides');
        slidesA.push(['s1', 's2', 's3', 's4', 's5']);
        slidesB.push(['s1', 's2', 's3', 's4', 's5']);
      },
      editA(docA, rng) {
        const slides = docA.getArray<string>('slides');
        if (slides.length < 2) return;
        const from = rngInt(rng, 0, slides.length - 1);
        let to = rngInt(rng, 0, slides.length - 1);
        if (from === to) to = (to + 1) % slides.length;
        const item = slides.get(from)!;
        slides.delete(from, 1);
        const insertAt = to > from ? to - 1 : to;
        slides.insert(Math.max(0, insertAt), [item]);
      },
      editB(docB, rng) {
        const slides = docB.getArray<string>('slides');
        if (slides.length < 2) return;
        const from = rngInt(rng, 0, slides.length - 1);
        let to = rngInt(rng, 0, slides.length - 1);
        if (from === to) to = (to + 1) % slides.length;
        const item = slides.get(from)!;
        slides.delete(from, 1);
        const insertAt = to > from ? to - 1 : to;
        slides.insert(Math.max(0, insertAt), [item]);
      },
    });
  }

  // ── Category 3: Concurrent text + image ops ──
  for (let i = 0; i < 30; i++) {
    const num = id++;
    scenarios.push({
      id: `text-img-${num}`,
      category: 'concurrent-text-image-ops',
      setup(docA, docB, rng) {
        const elId = makeElId(rng);
        makeSlideDocFromIds(docA, `s-${num}`, [elId]);
        makeSlideDocFromIds(docB, `s-${num}`, [elId]);
        syncBidirectional(docA, docB);
      },
      editA(docA, rng) {
        // A edits the text layer content
        const elProps = docA.getMap<Y.Map<unknown>>('elementProps');
        const elId = elProps.keys().next().value;
        if (!elId) return;
        const text = docA.getText(`text:${elId}`);
        if (text && text.length > 0) {
          text.insert(rngInt(rng, 0, text.length), `A-${rngInt(rng, 0, 99)}`);
        }
        // A also mutates element props
        const props = elProps.get(elId);
        if (props) {
          props.set('name', `img-renamed-A-${rngInt(rng, 0, 99)}`);
        }
      },
      editB(docB, rng) {
        // B sets image-specific properties
        const elProps = docB.getMap<Y.Map<unknown>>('elementProps');
        const elId = elProps.keys().next().value;
        if (!elId) return;
        const props = elProps.get(elId);
        if (props) {
          props.set('transform', {
            x: rngInt(rng, 0, 200),
            y: rngInt(rng, 0, 200),
            w: rngInt(rng, 100, 500),
            h: rngInt(rng, 100, 500),
          });
        }
        // B inserts text on the same slide
        const text = docB.getText(`text:${elId}`);
        if (text && text.length > 0) {
          text.insert(rngInt(rng, 0, text.length), `B-${rngInt(rng, 0, 99)}`);
        }
      },
    });
  }

  // ── Category 3b: Concurrent text insertions at overlapping positions ──
  for (let i = 0; i < 15; i++) {
    const num = id++;
    scenarios.push({
      id: `text-overlap-${num}`,
      category: 'concurrent-text-image-ops',
      setup(docA, docB) {
        const textA = docA.getText('shared-text');
        textA.insert(0, 'The quick brown fox jumps over the lazy dog.');
        const textB = docB.getText('shared-text');
        textB.insert(0, 'The quick brown fox jumps over the lazy dog.');
      },
      editA(docA, rng) {
        const text = docA.getText('shared-text');
        const pos = rngInt(rng, 0, text.length);
        text.insert(pos, `AAA${rngInt(rng, 0, 999)} `);
      },
      editB(docB, rng) {
        const text = docB.getText('shared-text');
        const pos = rngInt(rng, 0, text.length);
        text.insert(pos, `BBB${rngInt(rng, 0, 999)} `);
      },
    });
  }

  // ── Category 4: Concurrent insert + delete ──
  for (let i = 0; i < 30; i++) {
    const num = id++;
    scenarios.push({
      id: `insert-delete-${num}`,
      category: 'concurrent-insert-delete',
      setup(docA, docB, rng) {
        const ids = Array.from({ length: 5 }, () => makeElId(rng));
        makeSlideDocFromIds(docA, `s-${num}`, ids);
        makeSlideDocFromIds(docB, `s-${num}`, ids);
        syncBidirectional(docA, docB);
      },
      editA(docA, rng) {
        // A inserts a new element
        const zOrder = docA.getArray<string>('zOrder');
        const newId = makeElId(rng);
        zOrder.push([newId]);
        const elProps = docA.getMap<Y.Map<unknown>>('elementProps');
        const props = new Y.Map<unknown>();
        props.set('id', newId);
        props.set('name', `new-${newId}`);
        props.set('type', 'frame');
        props.set('parentId', null);
        props.set('transform', { x: 0, y: 0, w: 100, h: 100 });
        elProps.set(newId, props);
      },
      editB(docB, rng) {
        // B deletes an existing element from zOrder
        const zOrder = docB.getArray<string>('zOrder');
        if (zOrder.length > 0) {
          const idx = rngInt(rng, 0, zOrder.length - 1);
          zOrder.delete(idx, 1);
        }
      },
    });
  }

  // ── Category 4b: Concurrent insert + delete on text ──
  for (let i = 0; i < 20; i++) {
    const num = id++;
    scenarios.push({
      id: `text-insert-delete-${num}`,
      category: 'concurrent-insert-delete',
      setup(docA, docB) {
        const textA = docA.getText('doc');
        textA.insert(0, 'ABCDEFGHIJ');
        const textB = docB.getText('doc');
        textB.insert(0, 'ABCDEFGHIJ');
      },
      editA(docA, rng) {
        const text = docA.getText('doc');
        const pos = rngInt(rng, 0, text.length);
        text.insert(pos, `X${rngInt(rng, 0, 9)}`);
      },
      editB(docB, rng) {
        const text = docB.getText('doc');
        if (text.length > 0) {
          const pos = rngInt(rng, 0, text.length - 1);
          const delLen = Math.min(rngInt(rng, 1, 3), text.length - pos);
          text.delete(pos, delLen);
        }
      },
    });
  }

  // ── Category 5: Concurrent layer property bag merge (Y.Map) ──
  for (let i = 0; i < 30; i++) {
    const num = id++;
    scenarios.push({
      id: `map-merge-${num}`,
      category: 'concurrent-map-merge',
      setup(docA, docB) {
        const mapA = docA.getMap<unknown>('style-bag');
        mapA.set('fontSize', 16);
        mapA.set('fontFamily', 'Arial');
        mapA.set('color', '#000000');
        const mapB = docB.getMap<unknown>('style-bag');
        mapB.set('fontSize', 16);
        mapB.set('fontFamily', 'Arial');
        mapB.set('color', '#000000');
      },
      editA(docA, rng) {
        const map = docA.getMap<unknown>('style-bag');
        map.set('fontSize', rngInt(rng, 10, 48));
        map.set('fontWeight', rngPick(rng, ['bold', 'normal'] as const));
      },
      editB(docB, rng) {
        const map = docB.getMap<unknown>('style-bag');
        const hex = '#' + rngInt(rng, 0, 0xffffff).toString(16).padStart(6, '0');
        map.set('color', hex);
        map.set('lineHeight', +(1.0 + rng() * 1.5).toFixed(2));
      },
    });
  }

  // ── Category 5b: Concurrent multi-key map writes ──
  for (let i = 0; i < 15; i++) {
    const num = id++;
    scenarios.push({
      id: `map-multikey-${num}`,
      category: 'concurrent-map-merge',
      setup(docA, docB) {
        const mapA = docA.getMap<string>('config');
        mapA.set('theme', 'light');
        const mapB = docB.getMap<string>('config');
        mapB.set('theme', 'light');
      },
      editA(docA, rng) {
        const map = docA.getMap<string>('config');
        for (let j = 0; j < 5; j++) {
          map.set(`a-key-${rngInt(rng, 0, 99)}`, `a-val-${rngInt(rng, 0, 99)}`);
        }
      },
      editB(docB, rng) {
        const map = docB.getMap<string>('config');
        for (let j = 0; j < 5; j++) {
          map.set(`b-key-${rngInt(rng, 0, 99)}`, `b-val-${rngInt(rng, 0, 99)}`);
        }
      },
    });
  }

  // ── Category 6: Concurrent z-order insertion at same position ──
  for (let i = 0; i < 25; i++) {
    const num = id++;
    scenarios.push({
      id: `zorder-same-pos-${num}`,
      category: 'concurrent-z-order-insert',
      setup(docA, docB, rng) {
        const ids = Array.from({ length: 5 }, () => makeElId(rng));
        makeSlideDocFromIds(docA, `s-${num}`, ids);
        makeSlideDocFromIds(docB, `s-${num}`, ids);
        syncBidirectional(docA, docB);
      },
      editA(docA, rng) {
        const zOrder = docA.getArray<string>('zOrder');
        const pos = rngInt(rng, 0, zOrder.length);
        const newId = `zA-${makeElId(rng)}`;
        zOrder.insert(pos, [newId]);
        const elProps = docA.getMap<Y.Map<unknown>>('elementProps');
        const props = new Y.Map<unknown>();
        props.set('id', newId);
        props.set('name', 'zA-el');
        props.set('type', 'frame');
        elProps.set(newId, props);
      },
      editB(docB, rng) {
        const zOrder = docB.getArray<string>('zOrder');
        const pos = rngInt(rng, 0, zOrder.length);
        const newId = `zB-${makeElId(rng)}`;
        zOrder.insert(pos, [newId]);
        const elProps = docB.getMap<Y.Map<unknown>>('elementProps');
        const props = new Y.Map<unknown>();
        props.set('id', newId);
        props.set('name', 'zB-el');
        props.set('type', 'frame');
        elProps.set(newId, props);
      },
    });
  }

  // ── Category 7: Concurrent drag across two decks (element moved in both replicas) ──
  for (let i = 0; i < 20; i++) {
    const num = id++;
    scenarios.push({
      id: `cross-deck-drag-${num}`,
      category: 'concurrent-cross-deck-drag',
      setup(docA, docB) {
        const rootA = docA.getArray<string>('deck-elements');
        const rootB = docB.getArray<string>('deck-elements');
        rootA.push(['e1', 'e2', 'e3', 'e4', 'e5']);
        rootB.push(['e1', 'e2', 'e3', 'e4', 'e5']);
      },
      editA(docA) {
        // A moves e2 to position 3
        const root = docA.getArray<string>('deck-elements');
        if (root.length >= 2) {
          root.delete(1, 1); // remove e2 from position 1
          root.insert(3, ['e2']); // insert at position 3
        }
      },
      editB(docB) {
        // B moves e4 to position 1
        const root = docB.getArray<string>('deck-elements');
        if (root.length >= 4) {
          root.delete(3, 1); // remove e4 from position 3
          root.insert(1, ['e4']); // insert at position 1
        }
      },
    });
  }

  return scenarios;
}

// ─── Specific Documented Scenarios ───────────────────────────────────

/** (a) Single slide with 500 elements converges deterministically across three replicas. */
function test500ElementsThreeReplicas(): void {
  const seed = 42;
  const rng = mulberry32(seed);

  const docA = new Y.Doc();
  const docB = new Y.Doc();
  const docC = new Y.Doc();

  makeSlideDoc(docA, 'mega-slide', 500, rng);

  // Copy initial state to B and C
  Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
  Y.applyUpdate(docC, Y.encodeStateAsUpdate(docA));

  // A edits some element names
  const propsA = docA.getMap<Y.Map<unknown>>('elementProps');
  const keysA = Array.from(propsA.keys());
  for (let i = 0; i < 20; i++) {
    const key = keysA[rngInt(rng, 0, keysA.length - 1)];
    if (!key) continue;
    const props = propsA.get(key);
    if (props) props.set('name', `renamed-A-${i}`);
  }

  // B edits transforms
  const propsB = docB.getMap<Y.Map<unknown>>('elementProps');
  const keysB = Array.from(propsB.keys());
  for (let i = 0; i < 15; i++) {
    const key = keysB[rngInt(rng, 0, keysB.length - 1)];
    if (!key) continue;
    const props = propsB.get(key);
    if (props) {
      props.set('transform', { x: rngInt(rng, 0, 999), y: rngInt(rng, 0, 999), w: 100, h: 100 });
    }
  }

  // C edits hidden/locked
  const propsC = docC.getMap<Y.Map<unknown>>('elementProps');
  const keysC = Array.from(propsC.keys());
  for (let i = 0; i < 10; i++) {
    const key = keysC[rngInt(rng, 0, keysC.length - 1)];
    if (!key) continue;
    const props = propsC.get(key);
    if (props) {
      props.set('locked', rng() > 0.5);
    }
  }

  syncThreeAndAssert(docA, docB, docC);

  docA.destroy();
  docB.destroy();
  docC.destroy();
}

/** (b) Concurrent slide reorder via RGA pattern on the deck root doc. */
function testConcurrentSlideReorder(): void {
  const docA = new Y.Doc();
  const docB = new Y.Doc();

  // Seed initial state in A, then sync to B so both share identical Y IDs.
  const slidesA = docA.getArray<string>('slide-order');
  slidesA.push(['s1', 's2', 's3', 's4', 's5']);
  // Sync A → B so B gets the same items with same Y IDs.
  Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

  // --- Now apply concurrent (unsynced) edits ---

  // A moves s1 to after s3
  const aArr = slidesA.toArray();
  const aFrom = aArr.indexOf('s1');
  slidesA.delete(aFrom, 1);
  const aArr2 = slidesA.toArray();
  const aTo = aArr2.indexOf('s3');
  slidesA.insert(aTo + 1, ['s1']);

  // B moves s5 to before s2
  const slidesB = docB.getArray<string>('slide-order');
  const bArr = slidesB.toArray();
  const bFrom = bArr.indexOf('s5');
  slidesB.delete(bFrom, 1);
  const bArr2 = slidesB.toArray();
  const bTo = bArr2.indexOf('s2');
  slidesB.insert(bTo, ['s5']);

  syncBidirectional(docA, docB);
  assertConverged(docA, docB, 'slide-reorder');

  // Both must contain the same elements (converged order is deterministic)
  const finalA = slidesA.toArray();
  const finalB = slidesB.toArray();
  expect(finalA).toEqual(finalB);
  expect(finalA).toContain('s1');
  expect(finalA).toContain('s5');
  expect(finalA).toHaveLength(5);

  docA.destroy();
  docB.destroy();
}

/** (d) Presence state merges correctly (last-write-wins on cursor position per user). */
function testPresenceMerge(): void {
  const docA = new Y.Doc();
  const docB = new Y.Doc();

  const awarenessA = createAwareness(docA);
  const awarenessB = createAwareness(docB);

  // Alice on A, Bob on B
  updatePresence(awarenessA, 'alice', {
    name: 'Alice',
    color: '#E64B35',
    cursor: { x: 100, y: 200 },
    activeSlide: 'intro',
  });

  updatePresence(awarenessB, 'bob', {
    name: 'Bob',
    color: '#4E79A7',
    cursor: { x: 300, y: 400 },
    activeSlide: 'intro',
  });

  // Sync awareness state
  const updateA = encodeAwarenessUpdate(awarenessA, [docA.clientID]);
  applyAwarenessUpdate(awarenessB, updateA, 'sync');

  const updateB = encodeAwarenessUpdate(awarenessB, [docB.clientID]);
  applyAwarenessUpdate(awarenessA, updateB, 'sync');

  // Both should see each other
  const peersA = getPeers(awarenessA);
  const peersB = getPeers(awarenessB);
  expect(peersA.length).toBe(1);
  expect(peersB.length).toBe(1);
  expect(peersA[0]!.userState.name).toBe('Bob');
  expect(peersB[0]!.userState.name).toBe('Alice');

  // Now Alice moves her cursor
  updatePresence(awarenessA, 'alice', {
    cursor: { x: 500, y: 600 },
  });

  // Bob also moves his cursor
  updatePresence(awarenessB, 'bob', {
    cursor: { x: 700, y: 800 },
  });

  // Sync again
  const updateA2 = encodeAwarenessUpdate(awarenessA, [docA.clientID]);
  applyAwarenessUpdate(awarenessB, updateA2, 'sync');
  const updateB2 = encodeAwarenessUpdate(awarenessB, [docB.clientID]);
  applyAwarenessUpdate(awarenessA, updateB2, 'sync');

  // Verify Bob sees Alice's updated cursor
  const peersA2 = getPeers(awarenessA);
  const bobEntry = peersA2.find((p: { userState: PresenceState }) => p.userState.name === 'Bob');
  expect(bobEntry).toBeDefined();
  expect(bobEntry!.userState.cursor).toEqual({ x: 700, y: 800 });

  // Verify Alice sees Bob's updated cursor
  const peersB2 = getPeers(awarenessB);
  const aliceEntry = peersB2.find(
    (p: { userState: PresenceState }) => p.userState.name === 'Alice',
  );
  expect(aliceEntry).toBeDefined();
  expect(aliceEntry!.userState.cursor).toEqual({ x: 500, y: 600 });

  awarenessA.destroy();
  awarenessB.destroy();
  docA.destroy();
  docB.destroy();
}

// ─── Main Test Suite ─────────────────────────────────────────────────

const allScenarios = generateScenarios();

describe('convergence corpus', () => {
  const SEED_COUNT = 100;
  const failures: Array<{ scenarioId: string; seed: number; error: string }> = [];

  for (const scenario of allScenarios) {
    it(`${scenario.id} [${scenario.category}] — ${SEED_COUNT} seeds`, () => {
      for (let seed = 1; seed <= SEED_COUNT; seed++) {
        const rng = mulberry32(seed * 1000 + hashString(scenario.id));
        const docA = new Y.Doc();
        const docB = new Y.Doc();

        try {
          scenario.setup(docA, docB, rng);
          scenario.editA(docA, rng);
          scenario.editB(docB, rng);
          syncBidirectional(docA, docB);
          assertConverged(docA, docB, scenario.id);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          failures.push({ scenarioId: scenario.id, seed, error: msg });
          throw new Error(
            `Convergence failed: scenario=${scenario.id} seed=${seed}\n${err instanceof Error ? err.stack : String(err)}`,
          );
        } finally {
          docA.destroy();
          docB.destroy();
        }
      }
    });
  }

  // (a) 500-element three-replica convergence
  it('(a) 500 elements converge across 3 replicas', () => {
    test500ElementsThreeReplicas();
  });

  // (b) Concurrent slide reorder via RGA
  it('(b) concurrent slide reorder via RGA converges', () => {
    testConcurrentSlideReorder();
  });

  // (d) Presence state merge
  it('(d) presence state merges correctly (LWW per user)', () => {
    testPresenceMerge();
  });

  afterAll(() => {
    if (failures.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        `\n=== CONVERGENCE FAILURES: ${failures.length} ===`,
        failures.map((f) => `  scenario=${f.scenarioId} seed=${f.seed} err=${f.error}`),
      );
    }
  });
});
