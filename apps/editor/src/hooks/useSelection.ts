/**
 * useSelection — friendly façade over the editor store's selection slice.
 *
 * Wave 2 §Phase A — the existing EditorRoot held `selectedIds` as a raw
 * useState; panels read it through `PanelState`. After Wave 2, panels
 * and canvas components both import this hook instead.
 */

import { useCallback, useMemo } from 'react';
import type { DeckDocument, Element, ULID } from '@domio/schema/generated/scene-graph';
import { useEditorStore } from '../store/editor-store';

export interface UseSelectionResult {
  /** Readonly set of selected ids. */
  ids: ReadonlySet<ULID>;
  /** Materialised elements, in stable order. Empty when no deck. */
  elements: readonly Element[];
  /** The single element when exactly one is selected. */
  single: Element | undefined;
  /** True when more than one element is selected. */
  isMulti: boolean;
  /** True when the selected element is a smart component. */
  isComponent: boolean;
  toggle: (id: ULID, modifiers?: { shift?: boolean; alt?: boolean }) => void;
  select: (ids: Iterable<ULID>) => void;
  add: (ids: Iterable<ULID>) => void;
  remove: (ids: Iterable<ULID>) => void;
  clear: () => void;
}

export interface UseSelectionOptions {
  /**
   * SSR safety net — falls back to the prop deck before the store
   * has been seeded (first render on the server, before
   * `useRef`-gated seed runs in EditorRoot).
   */
  fallbackDeck?: DeckDocument | null;
}

export function useSelection(options: UseSelectionOptions = {}): UseSelectionResult {
  const { fallbackDeck = null } = options;
  const ids = useEditorStore((s) => s.selectedIds);
  const storeDeck = useEditorStore((s) => s.deck);
  const deck = storeDeck ?? fallbackDeck;
  const toggleSelected = useEditorStore((s) => s.toggleSelected);
  const setSelected = useEditorStore((s) => s.setSelected);
  const addSelected = useEditorStore((s) => s.addSelected);
  const removeSelected = useEditorStore((s) => s.removeSelected);
  const clearSelected = useEditorStore((s) => s.clearSelected);

  const elements = useMemo<readonly Element[]>(() => {
    if (!deck) return [];
    const flat: Element[] = [];
    for (const slide of deck.slides ?? []) {
      for (const element of slide.elements ?? []) {
        if (ids.has(element.id)) flat.push(element);
      }
    }
    return flat;
  }, [deck, ids]);

  const single = elements.length === 1 ? elements[0] : undefined;
  const isMulti = elements.length > 1;

  const toggle = useCallback(
    (id: ULID, modifiers?: { shift?: boolean; alt?: boolean }) => {
      toggleSelected(id, modifiers);
    },
    [toggleSelected],
  );
  const select = useCallback((next: Iterable<ULID>) => setSelected(next), [setSelected]);
  const add = useCallback((next: Iterable<ULID>) => addSelected(next), [addSelected]);
  const remove = useCallback((next: Iterable<ULID>) => removeSelected(next), [removeSelected]);
  const clear = useCallback(() => clearSelected(), [clearSelected]);

  return {
    ids,
    elements,
    single,
    isMulti,
    isComponent: single?.type === 'component',
    toggle,
    select,
    add,
    remove,
    clear,
  };
}
