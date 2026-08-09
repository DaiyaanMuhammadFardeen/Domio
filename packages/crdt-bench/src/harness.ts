/**
 * @domio/crdt-bench — convergence harness.
 *
 * Spawns N virtual editors, each with its own Y.Doc + SubDocRegistry.
 * The harness simulates a server by relaying Yjs updates between all
 * clients — INCLUDING sub-doc updates, so convergence across the
 * deck + slide sub-docs is what we measure.
 *
 * Convergence is measured as the time from "editor X issues update"
 * to "all other editors have applied it".
 *
 * Why this harness:
 *   - It uses the SAME Yjs version and the SAME SubDocRegistry from
 *     `@domio/yjs-shared` that production uses.
 *   - It runs in a single Node process; N=1000 fits comfortably.
 *   - It produces convergence timing histograms that the regression
 *     detector can compare against a baseline.
 *
 * Why we don't use the official `yjs-bench`:
 *   - It benchmarks operations/second, not convergence time.
 *   - It doesn't speak the Domio SubDoc protocol; we need that.
 */

import * as Y from 'yjs';
import { SubDocRegistry, ensureSlide } from '@domio/yjs-shared';
import type { ULID } from '@domio/schema';

export interface VirtualEditor {
  readonly id: number;
  readonly deckDoc: Y.Doc;
  readonly registry: SubDocRegistry;
  /** Time at which this editor last applied a remote update. */
  lastRemoteAppliedMs: number;
  /** Last observed state vector from any peer. */
  lastStateVector: Uint8Array;
}

export interface EditorFactory {
  readonly id: number;
}

/** Create a virtual editor with its own deck doc and slide sub-doc. */
export function createEditor(_factory: EditorFactory): VirtualEditor {
  const deckDoc = new Y.Doc({ guid: `deck-${_factory.id}` });
  const registry = new SubDocRegistry(deckDoc);
  const slideDoc = registry.getOrCreateSlide('slide-0');
  ensureSlide(slideDoc, {
    id: 'slide-0' as ULID,
    semanticId: 'slide-0',
    position: 0,
    aspect: { ratioW: 16, ratioH: 9 },
    elements: [],
  });
  return {
    id: _factory.id,
    deckDoc,
    registry,
    lastRemoteAppliedMs: Date.now(),
    lastStateVector: Y.encodeStateVector(deckDoc),
  };
}

/** Convergence event: editor X applied a remote update from editor Y. */
export interface ConvergenceEvent {
  readonly fromEditorId: number;
  readonly toEditorId: number;
  readonly issuedMs: number;
  readonly appliedMs: number;
  readonly latencyMs: number;
}

/** Run a convergence benchmark. */
export interface BenchOptions {
  readonly editorCount: number;
  readonly editsPerEditor: number;
  readonly editIntervalMs: number;
  readonly scenario: BenchScenario;
  readonly signal?: AbortSignal;
}

export type BenchScenario =
  | 'text-insert'
  | 'shape-add'
  | 'slide-insert'
  | 'mixed';

export interface BenchResult {
  readonly editors: number;
  readonly totalEdits: number;
  readonly scenario: BenchScenario;
  readonly convergenceMs: {
    readonly p50: number;
    readonly p95: number;
    readonly p99: number;
    readonly max: number;
    readonly mean: number;
  };
  readonly memoryBytes: number;
  readonly durationMs: number;
  readonly aborted: boolean;
}

interface DocBundle {
  /** deck doc */
  deckDoc: Y.Doc;
  /** sub-doc semantic key → Y.Doc */
  subs: Map<string, Y.Doc>;
  /** has the bundle been wired with update listeners? */
  wired: boolean;
}

/** Run a convergence bench with `editorCount` virtual editors. */
export async function runConvergenceBench(opts: BenchOptions): Promise<BenchResult> {
  const editors: VirtualEditor[] = [];
  for (let i = 0; i < opts.editorCount; i++) {
    editors.push(createEditor({ id: i }));
  }

  // Each editor tracks convergence events for edits it issues.
  const convergenceEvents: ConvergenceEvent[] = [];
  const pendingByFrom = new Map<number, { issuedMs: number; seen: Set<number> }>();
  const startRss = process.memoryUsage().rss;

  // Per-editor "bundle" of deck + sub-docs. We track sub-docs by
  // semantic key so we can relay state into the peer's matching
  // sub-doc by the same key.
  const bundles = new Map<number, DocBundle>();
  for (const editor of editors) {
    bundles.set(editor.id, {
      deckDoc: editor.deckDoc,
      subs: new Map(editor.registry.keys().map((k) => [k, editor.registry.get(k)!])),
      wired: false,
    });
  }

  // Convergence handler used by both deck-docs and sub-docs.
  const onRemoteApplied = (editorId: number, origin: unknown): void => {
    const from = origin as number | undefined;
    if (typeof from !== 'number') return;
    const pending = pendingByFrom.get(from);
    if (!pending) return;
    if (pending.seen.has(editorId)) return;
    pending.seen.add(editorId);
    const now = Date.now();
    convergenceEvents.push({
      fromEditorId: from,
      toEditorId: editorId,
      issuedMs: pending.issuedMs,
      appliedMs: now,
      latencyMs: now - pending.issuedMs,
    });
    const editor = editors.find((e) => e.id === editorId);
    if (editor) editor.lastRemoteAppliedMs = now;
  };

  // Wire listeners on every doc we know about. As new sub-docs are
  // created during the bench, we'll wire them too (see below).
  const wireBundle = (id: number): void => {
    const bundle = bundles.get(id);
    if (!bundle || bundle.wired) return;
    bundle.wired = true;
    bundle.deckDoc.on('update', (_u, origin) => onRemoteApplied(id, origin));
    for (const sub of bundle.subs.values()) {
      sub.on('update', (_u, origin) => onRemoteApplied(id, origin));
    }
  };

  for (const editor of editors) {
    wireBundle(editor.id);
  }

  // Helper to register a brand-new sub-doc with the bundle, wire its
  // update listener, and create a matching placeholder on every peer.
  const registerNewSub = (editorId: number, key: string): void => {
    const sub = editors[editorId]!.registry.get(key);
    if (!sub) return;
    const bundle = bundles.get(editorId)!;
    if (!bundle.subs.has(key)) {
      bundle.subs.set(key, sub);
      sub.on('update', (_u, origin) => onRemoteApplied(editorId, origin));
    }
    for (const peer of editors) {
      if (peer.id === editorId) continue;
      const peerBundle = bundles.get(peer.id)!;
      if (!peerBundle.subs.has(key)) {
        const peerSub = peer.registry.getOrCreateSlide(key);
        peerBundle.subs.set(key, peerSub);
        peerSub.on('update', (_u, origin) => onRemoteApplied(peer.id, origin));
      }
    }
  };

  const benchStart = Date.now();

  // Drive edits round-robin.
  for (let round = 0; round < opts.editsPerEditor; round++) {
    if (opts.signal?.aborted) break;
    for (const editor of editors) {
      if (opts.signal?.aborted) break;
      const issuedMs = Date.now();
      pendingByFrom.set(editor.id, { issuedMs, seen: new Set([editor.id]) });

      switch (opts.scenario) {
        case 'text-insert':
          applyTextInsert(editor);
          break;
        case 'shape-add':
          applyShapeAdd(editor);
          break;
        case 'slide-insert':
          applySlideInsert(editor, registerNewSub);
          break;
        case 'mixed':
          applyTextInsert(editor);
          if (round % 5 === 0) applyShapeAdd(editor);
          if (round % 50 === 0) applySlideInsert(editor, registerNewSub);
          break;
      }

      // Broadcast deck-doc update + every sub-doc update to all peers.
      const bundle = bundles.get(editor.id)!;
      const deckUpdate = Y.encodeStateAsUpdate(bundle.deckDoc);
      const subUpdates: Array<{ key: string; update: Uint8Array }> = [];
      for (const [key, sub] of bundle.subs.entries()) {
        subUpdates.push({ key, update: Y.encodeStateAsUpdate(sub) });
      }
      for (const peer of editors) {
        if (peer.id === editor.id) continue;
        Y.applyUpdate(peer.deckDoc, deckUpdate, editor.id);
        const peerBundle = bundles.get(peer.id)!;
        for (const { key, update } of subUpdates) {
          let peerSub = peerBundle.subs.get(key);
          if (!peerSub) {
            peerSub = peer.registry.getOrCreateSlide(key);
            peerBundle.subs.set(key, peerSub);
            peerSub.on('update', (_u, origin) => onRemoteApplied(peer.id, origin));
          }
          Y.applyUpdate(peerSub, update, editor.id);
        }
      }

      if (opts.editIntervalMs > 0) {
        await new Promise((r) => setTimeout(r, opts.editIntervalMs));
      }
    }
  }

  const benchEnd = Date.now();
  const endRss = process.memoryUsage().rss;

  const latencies = convergenceEvents.map((e) => e.latencyMs).sort((a, b) => a - b);
  const total = latencies.reduce((s, l) => s + l, 0);

  return {
    editors: editors.length,
    totalEdits: convergenceEvents.length,
    scenario: opts.scenario,
    convergenceMs: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      p99: percentile(latencies, 0.99),
      max: latencies[latencies.length - 1] ?? 0,
      mean: latencies.length > 0 ? total / latencies.length : 0,
    },
    memoryBytes: endRss - startRss,
    durationMs: benchEnd - benchStart,
    aborted: opts.signal?.aborted ?? false,
  };
}

function applyTextInsert(editor: VirtualEditor): void {
  const slide = editor.registry.getOrCreateSlide('slide-0');
  const text = slide.getText('body');
  text.insert(text.length, `x${editor.id}`);
}

function applyShapeAdd(editor: VirtualEditor): void {
  const slide = editor.registry.getOrCreateSlide('slide-0');
  const shapes = slide.getArray<Record<string, unknown>>('shapes');
  shapes.push([{ id: `s${shapes.length}-${editor.id}`, kind: 'rect', x: 0, y: 0 }]);
}

function applySlideInsert(editor: VirtualEditor, registerNewSub: (editorId: number, key: string) => void): void {
  const deck = editor.deckDoc.getArray<string>('slides');
  const nextIdx = deck.length;
  const key = `slide-${nextIdx}`;
  const subdoc = editor.registry.getOrCreateSlide(key);
  ensureSlide(subdoc, {
    id: key as ULID,
    semanticId: key,
    position: nextIdx,
    aspect: { ratioW: 16, ratioH: 9 },
    elements: [],
  });
  deck.push([key]);
  registerNewSub(editor.id, key);
}

export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx]!;
}
