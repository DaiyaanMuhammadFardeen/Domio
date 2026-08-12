/**
 * SlideStage — letterboxed 16:9 stage that renders a single slide.
 *
 * Per Wave 3 §S3.1 + §S3.12 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * The stage uses the slide's aspect ratio (or the deck's default) to
 * size itself; outside the stage, a letterbox / pillarbox is applied.
 * Each element on the slide is rendered by the appropriate renderer
 * (registry in `./ElementRendererRegistry.ts`). The simple kinds
 * (frame / group / text / image / vector / boolean / component) get
 * a minimal but accessible placeholder; the rich kinds
 * (model3d / video / audio / embed / etc.) get their dedicated
 * renderer from §S3.12.
 */

'use client';

import type { ReactElement, CSSProperties } from 'react';
import type {
  AspectRatio,
  Element,
  Slide,
  TextLayer,
  ImageLayer,
  FrameLayer,
  GroupLayer,
  AutoLayoutLayer,
  VectorLayer,
  BooleanShapeLayer,
  ComponentLayer,
  ColorRGBA,
} from '@domio/schema/generated/scene-graph';
import {
  arHandoffFor,
  createElementRendererRegistry,
  riveFor,
  segmentedVideoFor,
} from './ElementRendererRegistry';

export interface SlideStageProps {
  readonly slide: Slide;
  readonly fallbackAspect?: AspectRatio;
  readonly reducedMotion: boolean;
  readonly watermarkText?: string;
  readonly workspaceId?: string;
  readonly deckId?: string;
  readonly dataTestId?: string;
}

export function SlideStage({
  slide,
  fallbackAspect,
  reducedMotion,
  watermarkText,
  workspaceId,
  deckId,
  dataTestId = 'slide-stage',
}: SlideStageProps): ReactElement {
  const aspect = slide.aspect ?? fallbackAspect ?? { ratioW: 16, ratioH: 9 };
  const paddingTop = `${(aspect.ratioH / aspect.ratioW) * 100}%`;
  const registry = createElementRendererRegistry();

  return (
    <div
      data-testid={dataTestId}
      className="slide-stage"
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 1280,
        margin: '0 auto',
        paddingTop,
        background: '#0F172A',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
        }}
      >
        {slide.elements.map((el) => {
          const baseId = `${dataTestId}-element-${el.id}`;
          // Segmented video takes precedence: when a deck has chapters
          // we want the chapter-scrub UI even though the registry has
          // a default VideoPlayer.
          const segmented = segmentedVideoFor(el, reducedMotion, baseId);
          if (segmented) {
            return <FragmentElement key={el.id}>{segmented}</FragmentElement>;
          }
          const rive = riveFor(el, reducedMotion, baseId);
          if (rive) {
            return <FragmentElement key={el.id}>{rive}</FragmentElement>;
          }
          const specialized = registry[el.type]?.({
            element: el,
            reducedMotion,
            ...(workspaceId ? { workspaceId } : {}),
            ...(deckId ? { deckId } : {}),
            dataTestId: baseId,
          });
          if (specialized) {
            return <FragmentElement key={el.id}>{specialized}</FragmentElement>;
          }
          return (
            <SlideElementView
              key={el.id}
              element={el}
              reducedMotion={reducedMotion}
              dataTestId={baseId}
            />
          );
        })}
        {deckId
          ? slide.elements.map((el) => {
              const ar = arHandoffFor(el, deckId);
              return ar ? <FragmentElement key={`${el.id}-ar`}>{ar}</FragmentElement> : null;
            })
          : null}
        {watermarkText ? (
          <div
            data-testid={`${dataTestId}-watermark`}
            aria-hidden
            style={{
              position: 'absolute',
              bottom: 12,
              right: 16,
              opacity: 0.08,
              fontSize: 14,
              color: '#fff',
              pointerEvents: 'none',
              fontFamily: 'monospace',
            }}
          >
            {watermarkText}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FragmentElement({ children }: { readonly children: ReactElement }): ReactElement {
  return <>{children}</>;
}

/**
 * SlideElementView — covers the element kinds that don't need their
 * own renderer: text, frame, group, auto-layout, image, vector,
 * boolean shape, and component instance.
 */
function SlideElementView({
  element,
  reducedMotion,
  dataTestId,
}: {
  readonly element: Element;
  readonly reducedMotion: boolean;
  readonly dataTestId: string;
}): ReactElement | null {
  const transform = element.transform;
  const style: CSSProperties = {
    position: 'absolute',
    left: transform ? `${(transform.x / 1280) * 100}%` : '0',
    top: transform ? `${(transform.y / 720) * 100}%` : '0',
    width: transform ? `${(transform.w / 1280) * 100}%` : '100%',
    height: transform ? `${(transform.h / 720) * 100}%` : 'auto',
    transform: transform?.rotation ? `rotate(${transform.rotation}rad)` : undefined,
    transition: reducedMotion ? 'none' : 'opacity 200ms ease-out',
  };

  switch (element.type) {
    case 'text':
      return <TextView layer={element} style={style} dataTestId={dataTestId} />;
    case 'image':
      return <ImageView layer={element} style={style} dataTestId={dataTestId} />;
    case 'frame':
    case 'group':
    case 'autoLayout':
    case 'vector':
    case 'boolean':
    case 'component':
      return <ShapeView layer={element} style={style} dataTestId={dataTestId} />;
    default:
      return null;
  }
}

function TextView({
  layer,
  style,
  dataTestId,
}: {
  readonly layer: TextLayer;
  readonly style: CSSProperties;
  readonly dataTestId: string;
}): ReactElement {
  return (
    <div data-testid={dataTestId} style={{ ...style, color: '#fff', fontSize: '1em' }}>
      {layer.text.content}
    </div>
  );
}

function ImageView({
  layer,
  style,
  dataTestId,
}: {
  readonly layer: ImageLayer;
  readonly style: CSSProperties;
  readonly dataTestId: string;
}): ReactElement {
  const url = `https://media.domio.app/${layer.assetId}`;
  return (
    <img
      src={url}
      alt={layer.alt ?? layer.name}
      data-testid={dataTestId}
      style={{ ...style, objectFit: layer.fit ?? 'cover' }}
    />
  );
}

function ShapeView({
  layer,
  style,
  dataTestId,
}: {
  readonly layer: FrameLayer | GroupLayer | AutoLayoutLayer | VectorLayer | BooleanShapeLayer | ComponentLayer;
  readonly style: CSSProperties;
  readonly dataTestId: string;
}): ReactElement {
  const isBoolean = layer.type === 'boolean';
  const isVector = layer.type === 'vector';
  const fillBg = layer.fill?.type === 'solid' && layer.fill.color ? rgbaCss(layer.fill.color) : 'rgba(255,255,255,0.05)';
  const strokeCss = layer.stroke && layer.stroke.color
    ? `${layer.stroke.width ?? 1}px ${rgbaCss(layer.stroke.color)}`
    : '1px dashed rgba(255,255,255,0.18)';
  return (
    <div
      data-testid={dataTestId}
      data-element-type={layer.type}
      style={{
        ...style,
        background: isVector || isBoolean ? fillBg : 'transparent',
        border: strokeCss,
        borderRadius: 4,
        color: 'rgba(255,255,255,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
      }}
    >
      {layer.name}
    </div>
  );
}

function rgbaCss(color: ColorRGBA): string {
  return `rgba(${color.r},${color.g},${color.b},${color.a})`;
}