/**
 * useActiveSlide — resolves the currently-active slide from `deck +
 * activeSlideId`. Falls back to the first slide when no id is set.
 *
 * Wave 2 §Phase A — the editor had `activeSlide` derived inside
 * EditorRoot; this hook surfaces it without EditorRoot needing to pass
 * the value down through every panel's prop chain.
 */

import { useMemo } from 'react';
import type { Slide } from '@domio/schema/generated/scene-graph';
import { useEditorStore } from '../store/editor-store';

export interface UseActiveSlideResult {
  slide: Slide | undefined;
  index: number;
}

export function useActiveSlide(): UseActiveSlideResult {
  const deck = useEditorStore((s) => s.deck);
  const activeSlideId = useEditorStore((s) => s.activeSlideId);
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