/**
 * Element renderer registry — dispatch map for `Element` kinds → React components.
 *
 * Per Wave 3 §S3.12 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * Each Element kind is rendered by exactly one component. The viewer
 * never special-cases element types — adding a new `LayerType` to
 * scene-graph + registering a renderer here is the entire surface.
 */

import type { Element } from '@domio/schema/generated/scene-graph';
import { VideoPlayer } from '../video/VideoPlayer';
import { SegmentedVideoPlayer } from '../video/SegmentedVideoPlayer';
import { AudioTrack } from '../audio/AudioTrack';
import { Model3DViewer } from '../three/Model3DViewer';
import { ARHandoff } from '../ar/ARHandoff';
import { LottiePlayer } from '../animation/LottiePlayer';
import { RivePlayer } from '../animation/RivePlayer';
import { LiveAppEmbed } from '../embeds/LiveAppEmbed';
import { CodeBlock } from '../embeds/CodeBlock';
import { LatexBlock } from '../embeds/LatexBlock';
import { Map } from '../embeds/Map';

export interface ElementRenderContext {
  readonly element: Element;
  readonly reducedMotion: boolean;
  readonly workspaceId?: string;
  readonly deckId?: string;
  readonly dataTestId: string;
}

export type ElementRenderer = (ctx: ElementRenderContext) => React.ReactElement | null;

/**
 * Build the default registry. Each element kind routes to the right
 * renderer. Renderers that don't need extra args (workspace/deck)
 * just ignore those fields via a destructure.
 */
export function createElementRendererRegistry(): Readonly<Record<Element['type'], ElementRenderer>> {
  return {
    model3d: (ctx) => <Model3DViewer layer={ctx.element as Extract<Element, { type: 'model3d' }>} reducedMotion={ctx.reducedMotion} dataTestId={ctx.dataTestId} />,
    video: (ctx) => <VideoPlayer layer={ctx.element as Extract<Element, { type: 'video' }>} reducedMotion={ctx.reducedMotion} dataTestId={ctx.dataTestId} />,
    audio: (ctx) => <AudioTrack layer={ctx.element as Extract<Element, { type: 'audio' }>} dataTestId={ctx.dataTestId} />,
    lottie: (ctx) => <LottiePlayer layer={ctx.element as Extract<Element, { type: 'lottie' }>} reducedMotion={ctx.reducedMotion} dataTestId={ctx.dataTestId} />,
    embed: (ctx) => (
      <LiveAppEmbed
        layer={ctx.element as Extract<Element, { type: 'embed' }>}
        workspaceId={ctx.workspaceId ?? 'demo'}
        dataTestId={ctx.dataTestId}
      />
    ),
    codeBlock: (ctx) => <CodeBlock layer={ctx.element as Extract<Element, { type: 'codeBlock' }>} dataTestId={ctx.dataTestId} />,
    latex: (ctx) => <LatexBlock layer={ctx.element as Extract<Element, { type: 'latex' }>} dataTestId={ctx.dataTestId} />,
    map: (ctx) => <Map layer={ctx.element as Extract<Element, { type: 'map' }>} dataTestId={ctx.dataTestId} />,
    // Other kinds are handled in SlideStage with their own logic;
    // we only register the specialized viewers here.
    frame: () => null,
    group: () => null,
    autoLayout: () => null,
    text: () => null,
    image: () => null,
    vector: () => null,
    boolean: () => null,
    component: () => null,
  } as const;
}

/**
 * Convenience: render an AR handoff badge above a `model3d` element
 * when the deck has opt-in AR. Exposed separately so a slide can
 * stack Model3DViewer + ARHandoff.
 */
export function arHandoffFor(element: Element, deckId: string): React.ReactElement | null {
  if (element.type !== 'model3d') return null;
  return <ARHandoff layer={element} deckId={deckId} dataTestId="ar-handoff" />;
}

/**
 * Variant of the video player with chapter-driven segments. Kept
 * separate so decks that don't use chapters don't pay for the
 * scrub-list DOM.
 */
export function segmentedVideoFor(
  element: Element,
  reducedMotion: boolean,
  dataTestId: string,
): React.ReactElement | null {
  if (element.type !== 'video') return null;
  const videoEl = element as unknown as { chapters?: Array<{ timeMs: number; label: string }> };
  if ((videoEl.chapters?.length ?? 0) === 0) return null;
  return (
    <SegmentedVideoPlayer
      layer={element as Extract<Element, { type: 'video' }>}
      reducedMotion={reducedMotion}
      dataTestId={dataTestId}
    />
  );
}

/**
 * Rive renderers don't have a scene-graph LayerType yet — slots into
 * `lottie`-tagged layers with `style === 'rive'`.
 */
export function riveFor(
  element: Element,
  reducedMotion: boolean,
  dataTestId: string,
): React.ReactElement | null {
  if (element.type !== 'lottie') return null;
  const styleProp = (element as unknown as { style?: Record<string, unknown> }).style?.['engine'];
  if (styleProp !== 'rive') return null;
  return (
    <RivePlayer
      layer={{
        id: element.id,
        assetId: element.assetId,
      }}
      reducedMotion={reducedMotion}
      dataTestId={dataTestId}
    />
  );
}