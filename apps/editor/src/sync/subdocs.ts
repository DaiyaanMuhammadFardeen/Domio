/**
 * Thin wrapper that binds yjs-shared's SubDocRegistry to the editor's
 * loaded deck. Keeps the slide rail (Y.Array) in sync with deck.slides order.
 *
 * This module:
 * 1. Creates a deck root Y.Doc and slide sub-docs from the loaded DeckDocument
 * 2. Provides a bridge between the schema-level DeckDocument and Yjs CRDT state
 * 3. Watches for changes in deck.slides and keeps the Y.Array in sync
 */

import * as Y from 'yjs';
import type { DeckDocument, Slide } from '@domio/schema/generated/scene-graph';
import { SubDocRegistry, createDeckDocs, ensureSlide, serializeSlide } from '@domio/yjs-shared';

// ----- Deck sub-doc binding -----

export interface DeckSubDocs {
  /** The root Y.Doc for this deck. */
  deckRoot: Y.Doc;
  /** Registry for accessing sub-docs by key. */
  registry: SubDocRegistry;
  /** Map from slide semanticId to the slide Y.Doc. */
  slideDocs: Map<string, Y.Doc>;
  /** The Y.Array<string> that stores slide IDs in order (the "slide rail"). */
  slideOrder: Y.Array<string>;
}

/**
 * Initialize the sub-doc set for a loaded deck.
 *
 * Creates a deck root Y.Doc with a SubDocRegistry, seeds each slide sub-doc
 * from the schema, and builds a Y.Array that tracks slide ordering.
 */
export function initDeckSubDocs(deck: DeckDocument): DeckSubDocs {
  const { deckRoot, slideDocs } = createDeckDocs(deck.id, deck.slides);
  const registry = new SubDocRegistry(deckRoot);

  // Create the slide order array (tracks slide IDs in the deck root doc)
  const slideOrder = deckRoot.getArray<string>('slideOrder');

  // Sync slide order from the deck document
  syncSlideOrder(slideOrder, deck.slides);

  return { deckRoot, registry, slideDocs, slideOrder };
}

/**
 * Sync the Y.Array slide order with the schema-level slides array.
 * Only adds/removes if the order actually changed.
 */
export function syncSlideOrder(slideOrder: Y.Array<string>, slides: Slide[]): void {
  const targetOrder = slides.map((s) => s.semanticId);

  // Check if order is already correct
  if (slideOrder.length === targetOrder.length) {
    let isSame = true;
    for (let i = 0; i < targetOrder.length; i++) {
      if (slideOrder.get(i) !== targetOrder[i]) {
        isSame = false;
        break;
      }
    }
    if (isSame) return;
  }

  // Replace the array contents
  slideOrder.delete(0, slideOrder.length);
  slideOrder.push(targetOrder);
}

/**
 * Rebuild slide Y.Doc contents from a schema Slide object.
 * Useful when the schema has changed and the CRDT needs to be re-seeded.
 */
export function reseedSlideDoc(doc: Y.Doc, slide: Slide): void {
  ensureSlide(doc, slide);
}

/**
 * Serialize all slide sub-docs back to schema Slide objects.
 * Returns slides in the order specified by the slideOrder array.
 */
export function serializeAllSlides(subdocs: DeckSubDocs): Slide[] {
  const slides: Slide[] = [];
  for (let i = 0; i < subdocs.slideOrder.length; i++) {
    const semanticId = subdocs.slideOrder.get(i);
    const doc = subdocs.slideDocs.get(semanticId);
    if (!doc) continue;
    const slide = serializeSlide(doc);
    if (slide) {
      slides.push(slide);
    }
  }
  return slides;
}

/**
 * Get a specific slide sub-doc by its semantic ID.
 */
export function getSlideDoc(subdocs: DeckSubDocs, semanticId: string): Y.Doc | undefined {
  return subdocs.slideDocs.get(semanticId);
}

/**
 * Compute a digest of the Y.Doc state vector for a specific sub-doc.
 * Used for comparison during convergence checks.
 */
export function docDigest(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc);
}

/**
 * Check if two Y.Doc instances have converged (identical state).
 */
export function docsConverged(a: Y.Doc, b: Y.Doc): boolean {
  const stateA = Y.encodeStateAsUpdate(a);
  const stateB = Y.encodeStateAsUpdate(b);
  if (stateA.length !== stateB.length) return false;
  for (let i = 0; i < stateA.length; i++) {
    if (stateA[i] !== stateB[i]) return false;
  }
  return true;
}
