/**
 * Scroll-mode tests — S3.2.
 *
 * Per Wave 3 §S3.2 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScrollMode } from './ScrollMode';
import { ScrollSlide } from './ScrollSlide';
import exampleDeck from '../../../../fixtures/example-deck.json' with { type: 'json' };
import type { DeckDocument } from '@domio/schema/generated/scene-graph';

const deck = exampleDeck as unknown as DeckDocument;

describe('ScrollMode', () => {
  it('renders one ScrollSlide per deck slide', () => {
    render(<ScrollMode deck={deck} reducedMotion={false} />);
    const slides = screen.getAllByTestId(/^scroll-mode-slide-\d+$/);
    expect(slides.length).toBe(deck.slides.length);
    expect(slides.length).toBeGreaterThan(0);
  });

  it('shows the deck title in the header', () => {
    render(<ScrollMode deck={deck} reducedMotion={false} />);
    expect(screen.getByTestId('scroll-mode-header').textContent).toContain(deck.title);
  });

  it('renders an exit button', () => {
    render(<ScrollMode deck={deck} reducedMotion={false} onExitScroll={vi.fn()} />);
    expect(screen.getByTestId('scroll-mode-exit')).toBeInTheDocument();
  });

  it('renders a side rail progress indicator', () => {
    render(<ScrollMode deck={deck} reducedMotion={false} />);
    expect(screen.getByTestId('scroll-mode-rail')).toBeInTheDocument();
    expect(screen.getByTestId('scroll-mode-rail-progress')).toBeInTheDocument();
  });

  it('emits onActiveSlideChange for the initial slide', () => {
    const onActive = vi.fn();
    render(
      <ScrollMode
        deck={deck}
        reducedMotion={false}
        initialIdx={2}
        onActiveSlideChange={onActive}
      />,
    );
    expect(onActive).toHaveBeenCalledWith(2);
  });
});

describe('ScrollSlide', () => {
  it('renders the slide with a stage', () => {
    const slide = deck.slides[0]!;
    render(
      <ScrollSlide
        slide={slide}
        slideIdx={0}
        fallbackAspect={deck.settings.defaultSlideRatio}
        reducedMotion={false}
      />,
    );
    expect(screen.getByTestId('scroll-slide')).toBeInTheDocument();
    expect(screen.getByTestId('scroll-slide-stage')).toBeInTheDocument();
  });

  it('emits onSlideVisible when intersected', () => {
    const onVisible = vi.fn();
    const slide = deck.slides[0]!;
    const observed: ((entries: IntersectionObserverEntry[]) => void)[] = [];

    class MockIO {
      constructor(cb: (entries: IntersectionObserverEntry[]) => void) {
        observed.push(cb);
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
      root: Element | null = null;
      rootMargin = '';
      thresholds: ReadonlyArray<number> = [];
    }

    const Original = (globalThis as unknown as { IntersectionObserver: unknown })
      .IntersectionObserver;
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = MockIO;

    render(
      <ScrollSlide
        slide={slide}
        slideIdx={0}
        fallbackAspect={deck.settings.defaultSlideRatio}
        reducedMotion={false}
        onSlideVisible={onVisible}
      />,
    );

    const el = document.querySelector('[data-slide-idx="0"]') as Element;
    observed[0]!([
      {
        isIntersecting: true,
        target: el,
        boundingClientRect: {} as DOMRectReadOnly,
        intersectionRatio: 1,
        intersectionRect: {} as DOMRectReadOnly,
        rootBounds: null,
        time: 0,
      },
    ]);

    expect(onVisible).toHaveBeenCalledWith(0);
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = Original;
  });
});
