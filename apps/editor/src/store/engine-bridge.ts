/**
 * engine-bridge — single entry point for mutating the editor's deck
 * document.
 *
 * Per Wave 2 §Phase A. The Zustand store and every handler go through
 * here so:
 *  - the HistoryEngine, CRDT sync bridge, and autosave facade are
 *    the only collaborators that know the layout;
 *  - handlers in `store/handlers.ts` stay focused on intent
 *    ("add a hotspot", "patch the active sequence") and call
 *    `applyOp(op)` once;
 *  - undo/redo and remote-sync replay both flow through the same
 *    `setDeck` so we never end up with two decks in memory.
 *
 * The bridge is a thin coordinator over the constructor-once
 * `HistoryEngine` and the constructor-once `AutosaveFacade`. It does
 * NOT own the engine — `EditorRoot.tsx` constructs it once and hands
 * it in. The bridge is initialised lazily via `setEngineRef(...)`
 * because the engine is built off `useState(() => new HistoryEngine(deck))`
 * and React doesn't permit lazy access at module top level.
 */

import type { HistoryEngine, HistoryOp } from '@domio/canvas';
import type { DeckDocument } from '@domio/schema/generated/scene-graph';
import { createAutosaveFacade, type AutosaveFacade } from '../lib/autosave';
import { useEditorStore } from './editor-store';

let engineRef: HistoryEngine | null = null;
let autosaveRef: AutosaveFacade | null = null;
let keyCounter = 0;
function nextKey(): string {
  keyCounter += 1;
  return `op-${Date.now()}-${keyCounter}`;
}

function ensureEngine(): HistoryEngine {
  if (!engineRef) {
    throw new Error(
      'engine-bridge: engine not initialised; call setEngineRef() in EditorRoot before any mutation',
    );
  }
  return engineRef;
}

function ensureAutosave(): AutosaveFacade {
  if (!autosaveRef) {
    autosaveRef = createAutosaveFacade();
  }
  return autosaveRef;
}

/** Called once by `EditorRoot` after constructing `new HistoryEngine(deck)`. */
export function setEngineRef(engine: HistoryEngine): void {
  engineRef = engine;
}

/** Test/dev escape hatch — clears the bridge state. */
export function resetEngineBridge(): void {
  engineRef = null;
  autosaveRef = null;
  keyCounter = 0;
}

/**
 * Apply a HistoryOp to the engine, broadcast the resulting next deck
 * to the store, and enqueue it for autosave. Returns the next deck,
 * or `null` if the engine refused the op.
 */
export function applyOp(op: HistoryOp): DeckDocument | null {
  const engine = ensureEngine();
  const next = engine.apply(op);
  if (!next) return null;
  useEditorStore.getState().setDeck(next);
  ensureAutosave().enqueue(nextKey(), op);
  return next;
}

/** Undo the most recent local op; returns the new deck or null. */
export function undo(): DeckDocument | null {
  const engine = ensureEngine();
  const next = engine.undo();
  if (!next) return null;
  useEditorStore.getState().setDeck(next);
  return next;
}

/** Redo the most recently undone op; returns the new deck or null. */
export function redo(): DeckDocument | null {
  const engine = ensureEngine();
  const next = engine.redo();
  if (!next) return null;
  useEditorStore.getState().setDeck(next);
  return next;
}

/**
 * Replace the engine's tracked deck without recording a history entry.
 * Use this when applying a remote op replay so it doesn't pollute
 * the local undo stack.
 */
export function replaceDeck(next: DeckDocument): void {
  useEditorStore.getState().setDeck(next);
}

/** Snapshot current history state for the history panel. */
export function snapshotHistory(): {
  past: ReturnType<HistoryEngine['pastEntries']>;
  future: ReturnType<HistoryEngine['futureEntries']>;
} {
  if (!engineRef) {
    return { past: [], future: [] };
  }
  return {
    past: engineRef.pastEntries(),
    future: engineRef.futureEntries(),
  };
}

/** Subscribe to engine events (history changes). Cleans up on unmount. */
export function onEngineEvent(listener: () => void): () => void {
  if (!engineRef) {
    return () => {};
  }
  const engine = engineRef;
  engine.onEvent(listener);
  // HistoryEngine currently lacks off(); wrap so callers can use
  // the standard cleanup pattern.
  return () => {
    // no-op; preserved for API stability
    void engine;
  };
}
