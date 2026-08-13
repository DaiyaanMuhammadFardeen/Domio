/**
 * Copy/paste style. See docs/development_phases/phase-03 §D.3:
 *   `Cmd+Alt+C` copies style only; double-click enters persistent mode;
 *   `Esc` exits; cross-deck paste carries `themeMapping`.
 */

import type { DeckDocument, Element } from '@domio/schema';
import { migrateSnapshot, snapshotStyle, type StyleSnapshot } from './style-snapshot.js';

export interface StyleClipboard {
  snapshot: StyleSnapshot;
  /** Originating deck id (for cross-deck paste). */
  originDeckId: string | null;
}

export class StyleClipboardController {
  private clip: StyleClipboard | null = null;
  private persistent = false;

  copy(doc: DeckDocument, id: string): StyleClipboard {
    const element = findElement(doc, id);
    if (!element) {
      this.clip = null;
      return { snapshot: { formatVersion: 1 }, originDeckId: null };
    }
    const snapshot = snapshotStyle(element);
    this.clip = { snapshot, originDeckId: doc.id };
    return this.clip;
  }

  getClipboard(): StyleClipboard | null {
    return this.clip ? { ...this.clip, snapshot: migrateSnapshot(this.clip.snapshot) } : null;
  }

  setPersistent(value: boolean): void {
    this.persistent = value;
  }

  isPersistent(): boolean {
    return this.persistent;
  }

  cancel(): void {
    this.clip = null;
    this.persistent = false;
  }

  /**
   * Apply the clipboard snapshot to a target element. Returns a new deck
   * document with the merged style — does not mutate the original.
   */
  paste(doc: DeckDocument, targetId: string, themeTokens?: Record<string, string>): DeckDocument {
    if (!this.clip) return doc;
    const snapshot = migrateSnapshot(this.clip.snapshot);
    const target = findElement(doc, targetId);
    if (!target) return doc;
    const mappedTheme = snapshot.themeMapping
      ? mapTheme(snapshot.themeMapping, themeTokens ?? {})
      : undefined;
    const nextStyle: Record<string, unknown> = {
      ...((target.style ?? {}) as Record<string, unknown>),
      ...(snapshot.fill ? { fill: snapshot.fill } : {}),
      ...(snapshot.stroke ? { stroke: snapshot.stroke } : {}),
      ...(snapshot.fontFamily ? { fontFamily: snapshot.fontFamily } : {}),
      ...(snapshot.fontSize ? { fontSize: snapshot.fontSize } : {}),
      ...(snapshot.fontWeight ? { fontWeight: snapshot.fontWeight } : {}),
      ...(mappedTheme ? { themeMapping: mappedTheme } : {}),
    };
    return mapDocument(doc, targetId, nextStyle);
  }
}

function mapTheme(
  mapping: Record<string, string>,
  destination: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(mapping)) {
    const target = destination[key];
    out[key] = target ?? value;
  }
  return out;
}

function findElement(doc: DeckDocument, id: string): Element | null {
  for (const slide of doc.slides) {
    const found = slide.elements.find((el) => el.id === id);
    if (found) return found;
  }
  return null;
}

function mapDocument(
  doc: DeckDocument,
  targetId: string,
  nextStyle: Record<string, unknown>,
): DeckDocument {
  return {
    ...doc,
    slides: doc.slides.map((slide) => ({
      ...slide,
      elements: slide.elements.map((element) =>
        element.id === targetId ? { ...element, style: nextStyle } : element,
      ),
    })),
  };
}
