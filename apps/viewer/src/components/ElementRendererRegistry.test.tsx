/**
 * Element-renderer registry tests — S3.12.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Element, ULID } from '@domio/schema/generated/scene-graph';
import { SlideStage } from './SlideStage';
import { arHandoffFor, createElementRendererRegistry, riveFor, segmentedVideoFor } from './ElementRendererRegistry';
import exampleDeck from '../../../../fixtures/example-deck.json' with { type: 'json' };
import type { DeckDocument } from '@domio/schema/generated/scene-graph';

const deck = exampleDeck as unknown as DeckDocument;

function makeLayer(overrides: { type: Element['type']; id: string; [k: string]: unknown }): Element {
  const { id, type, ...rest } = overrides;
  void type;
  return {
    semanticId: 'sem',
    name: 'test',
    parentId: null,
    ...rest,
    id: id as unknown as ULID,
    type: overrides.type,
  } as unknown as Element;
}

describe('ElementRendererRegistry', () => {
  it('routes model3d to Model3DViewer', () => {
    const registry = createElementRendererRegistry();
    const layer = makeLayer({ id: 'm1', type: 'model3d', modelAssetId: 'asset-1' });
    const node = registry[layer.type]({ element: layer, reducedMotion: false, dataTestId: 'test' });
    expect(node).not.toBeNull();
  });

  it('routes video to VideoPlayer', () => {
    const registry = createElementRendererRegistry();
    const layer = makeLayer({ id: 'v1', type: 'video', assetId: 'asset-1' });
    expect(registry[layer.type]({ element: layer, reducedMotion: false, dataTestId: 'test' })).not.toBeNull();
  });

  it('routes audio to AudioTrack', () => {
    const registry = createElementRendererRegistry();
    const layer = makeLayer({ id: 'a1', type: 'audio', assetId: 'asset-1' });
    expect(registry[layer.type]({ element: layer, reducedMotion: false, dataTestId: 'test' })).not.toBeNull();
  });

  it('routes lottie to LottiePlayer', () => {
    const registry = createElementRendererRegistry();
    const layer = makeLayer({ id: 'l1', type: 'lottie', assetId: 'asset-1' });
    expect(registry[layer.type]({ element: layer, reducedMotion: false, dataTestId: 'test' })).not.toBeNull();
  });

  it('routes embed to LiveAppEmbed with workspaceId', () => {
    const registry = createElementRendererRegistry();
    const layer = makeLayer({ id: 'e1', type: 'embed', url: 'https://example.com' });
    expect(registry[layer.type]({ element: layer, reducedMotion: false, dataTestId: 'test', workspaceId: 'ws-1' })).not.toBeNull();
  });

  it('routes codeBlock to CodeBlock', () => {
    const registry = createElementRendererRegistry();
    const layer = makeLayer({ id: 'c1', type: 'codeBlock', code: 'console.log(1)' });
    expect(registry[layer.type]({ element: layer, reducedMotion: false, dataTestId: 'test' })).not.toBeNull();
  });

  it('routes latex to LatexBlock', () => {
    const registry = createElementRendererRegistry();
    const layer = makeLayer({ id: 'lx1', type: 'latex', source: 'E=mc^2' });
    expect(registry[layer.type]({ element: layer, reducedMotion: false, dataTestId: 'test' })).not.toBeNull();
  });

  it('routes map to Map', () => {
    const registry = createElementRendererRegistry();
    const layer = makeLayer({ id: 'mp1', type: 'map', styleId: 'osm', zoom: 5, center: { lng: 0, lat: 0 } });
    expect(registry[layer.type]({ element: layer, reducedMotion: false, dataTestId: 'test' })).not.toBeNull();
  });

  it('text/frame/group/etc do not have a specialized renderer', () => {
    const registry = createElementRendererRegistry();
    const kinds: Element['type'][] = ['text', 'frame', 'group', 'autoLayout', 'image', 'vector', 'boolean', 'component'];
    for (const k of kinds) {
      const layer = makeLayer({ id: `${k}1`, type: k });
      expect(registry[layer.type]({ element: layer, reducedMotion: false, dataTestId: 'test' })).toBeNull();
    }
  });
});

describe('arHandoffFor', () => {
  it('returns null for non-model3d elements', () => {
    const text = makeLayer({ id: 't', type: 'text' });
    expect(arHandoffFor(text, 'deck-1')).toBeNull();
  });
  it('returns AR handoff for model3d elements', () => {
    const m = makeLayer({ id: 'm', type: 'model3d', modelAssetId: 'a' });
    expect(arHandoffFor(m, 'deck-1')).not.toBeNull();
  });
});

describe('segmentedVideoFor', () => {
  it('returns null when there are no chapters', () => {
    const v = makeLayer({ id: 'v', type: 'video', assetId: 'a' });
    expect(segmentedVideoFor(v, false, 'x')).toBeNull();
  });
  it('returns SegmentedVideoPlayer when chapters exist', () => {
    const v = makeLayer({
      id: 'v',
      type: 'video',
      assetId: 'a',
      chapters: [{ timeMs: 1000, label: 'Intro' }],
    });
    expect(segmentedVideoFor(v, false, 'x')).not.toBeNull();
  });
});

describe('riveFor', () => {
  it('returns null for non-lottie elements', () => {
    const t = makeLayer({ id: 't', type: 'text' });
    expect(riveFor(t, false, 'x')).toBeNull();
  });
  it('returns null for lottie without rive engine', () => {
    const l = makeLayer({ id: 'l', type: 'lottie', assetId: 'a' });
    expect(riveFor(l, false, 'x')).toBeNull();
  });
  it('returns RivePlayer when style.engine === rive', () => {
    const l = makeLayer({ id: 'l', type: 'lottie', assetId: 'a' });
    (l as unknown as { style: Record<string, unknown> }).style = { engine: 'rive' };
    expect(riveFor(l, false, 'x')).not.toBeNull();
  });
});

describe('SlideStage with rich elements', () => {
  it('renders the example deck without errors', () => {
    const { container } = render(
      <SlideStage slide={deck.slides[0]!} reducedMotion={false} dataTestId="stage" />,
    );
    expect(container.querySelector('[data-testid="stage"]')).not.toBeNull();
  });

  it('renders a SegmentedVideoPlayer element when a video has chapters', () => {
    const slide = deck.slides[0]!;
    const videoLayer = {
      id: 'vid1',
      semanticId: 'sem',
      type: 'video' as const,
      name: 'video',
      parentId: null,
      assetId: 'a',
      chapters: [{ timeMs: 1000, label: 'Intro' }],
    };
    const withVideo = {
      ...slide,
      elements: [...slide.elements, videoLayer] as unknown as typeof slide.elements,
    };
    render(<SlideStage slide={withVideo} reducedMotion={false} dataTestId="stage" />);
    // Verify chapter button rendered (SegmentedVideoPlayer mounts the
    // chapter list as buttons nested above the inner video player).
    const chapters = document.querySelectorAll('[data-testid$="-chapter-1000"]');
    expect(chapters.length).toBeGreaterThan(0);
  });

  it('renders a code block element', () => {
    const slide = deck.slides[0]!;
    const withCode = {
      ...slide,
      elements: [
        ...slide.elements,
        makeLayer({ id: 'cb1', type: 'codeBlock', code: 'console.log(1)', runnable: true }),
      ],
    };
    render(<SlideStage slide={withCode} reducedMotion={false} dataTestId="stage" />);
    expect(screen.queryByTestId('stage-element-cb1')).not.toBeNull();
  });

  it('renders a latex element', () => {
    const slide = deck.slides[0]!;
    const withLatex = {
      ...slide,
      elements: [
        ...slide.elements,
        makeLayer({ id: 'lx1', type: 'latex', source: 'E=mc^2' }),
      ],
    };
    render(<SlideStage slide={withLatex} reducedMotion={false} dataTestId="stage" />);
    expect(screen.queryByTestId('stage-element-lx1')).not.toBeNull();
  });

  it('renders a map element', () => {
    const slide = deck.slides[0]!;
    const withMap = {
      ...slide,
      elements: [
        ...slide.elements,
        makeLayer({ id: 'mp1', type: 'map', styleId: 'osm', zoom: 5, center: { lng: 0, lat: 0 } }),
      ],
    };
    render(<SlideStage slide={withMap} reducedMotion={false} dataTestId="stage" />);
    expect(screen.queryByTestId('stage-element-mp1')).not.toBeNull();
  });

  it('emits AR handoff for model3d elements when deckId is set', () => {
    const slide = deck.slides[0]!;
    const withModel = {
      ...slide,
      elements: [
        ...slide.elements,
        makeLayer({ id: 'm1', type: 'model3d', modelAssetId: 'a' }),
      ],
    };
    render(<SlideStage slide={withModel} reducedMotion={false} deckId="demo" dataTestId="stage" />);
    expect(screen.queryByTestId('ar-handoff')).not.toBeNull();
  });

  it('does not crash with empty slide', () => {
    const emptySlide = { ...deck.slides[0]!, elements: [] };
    render(<SlideStage slide={emptySlide} reducedMotion={false} dataTestId="stage" />);
    expect(screen.queryByTestId('stage')).not.toBeNull();
  });

  it('respects vi.fn (sanity)', () => {
    expect(vi.fn()).toBeDefined();
  });
});