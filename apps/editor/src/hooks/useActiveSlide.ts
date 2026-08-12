/**
 * useActiveSlide — resolves the currently-active slide from `deck +
 * activeSlideId`. Falls back to the first slide when no id is set.
 *
 * Wave 2 §Phase A — the editor had `activeSlide` derived inside
 * EditorRoot; this hook surfaces it without EditorRoot needing to pass
 * the value down through every panel's prop chain.
 */

import { useMemo } from 'react';
import type { DeckDocument, Slide } from '@domio/schema/generated/scene-graph';
import { useEditorStore } from '../store/editor-store';

export interface UseActiveSlideResult {
  slide: Slide | undefined;
  index: number;
}

export interface UseActiveSlideOptions {
  /**
   * SSR safety net — during the very first render (before the
   * parent has had a chance to seed the store) the Zustand
   * selector returns `null`. Pass the prop deck here so SSR
   * still renders the active slide.
   */
  fallbackDeck?: DeckDocument | null;
  fallbackActiveId?: string | null;
}

export function useActiveSlide(
  options: UseActiveSlideOptions = {},
): UseActiveSlideResult {
  const { fallbackDeck = null, fallbackActiveId = null } = options;
  const storeDeck = useEditorStore((s) => s.deck);
  const storeId = useEditorStore((s) => s.activeSlideId);
  const deck = storeDeck ?? fallbackDeck;
  const activeSlideId = (storeId ?? fallbackActiveId) ?? null;
  return useMemo<UseActiveSlideResult>(() => {
    if (!deck) return { slide: undefined, index: -1 };
    const slides = deck.slides ?? [];
    if (slides.length === 0) return { slide: undefined, index: -1 };
    const idx = activeSlideId
      ? slides.findIndex((s) => s.id === activeSlideId)
      : 0;
    if (idx < 0) return { slide: slides[0], index: 0 };
    return { slide: slides[idx], index: idx };
  }, [deck, activeSlideId]);
}