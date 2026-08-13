/**
 * Server-side SVG renderer — builds compact SVG strings from deck scene-graph
 * data.  Dependency-free (pure string building, no DOM libs).
 *
 * Conventions mirror `apps/editor/src/components/ElementSvg.tsx`:
 *  - frames/autoLayout → `<rect>` with fill/stroke/borderRadius
 *  - text → `<text>` with fontSize/fontWeight/fontFamily/textAnchor
 *  - vector → `<path>` with d/fill/stroke
 *  - image → placeholder `<rect>` with accent fill
 *  - component → expanded via `expandComponent`, then recurse
 */

import type { Element, Slide } from '@domio/schema';
import { expandComponent } from '@domio/components';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rgbaToCss(rgba: { r: number; g: number; b: number; a: number }): string {
  const r = Math.round(rgba.r);
  const g = Math.round(rgba.g);
  const b = Math.round(rgba.b);
  if (rgba.a === 1) return `rgb(${r},${g},${b})`;
  return `rgba(${r},${g},${b},${rgba.a})`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function styleValue(el: Element, key: string): unknown {
  const style = el.style as Record<string, unknown> | undefined;
  return style?.[key];
}

function textFill(el: Element & { type: 'text' }): string {
  const fill = (el.style as Record<string, unknown> | undefined)?.fill as
    | { color?: { colorSpace?: string; value?: string } }
    | undefined;
  if (fill?.color?.value) return fill.color.value;
  return '#1a1a1a';
}

// ---------------------------------------------------------------------------
// Element rendering
// ---------------------------------------------------------------------------

function renderText(el: Element & { type: 'text' }): string {
  const t = el.transform;
  if (!t) return '';
  const fontSize = (styleValue(el, 'fontSize') as number | undefined) ?? 24;
  const fontWeight = (styleValue(el, 'fontWeight') as number | undefined) ?? 400;
  const fontFamily = (styleValue(el, 'fontFamily') as string | undefined) ?? 'Inter';
  const align = (styleValue(el, 'textAlign') as string | undefined) ?? 'start';
  const verticalCenter = (styleValue(el, 'verticalAlign') as string | undefined) === 'middle';
  const letterSpacing = styleValue(el, 'letterSpacing') as number | undefined;

  const anchor = align === 'middle' ? 'middle' : align === 'end' ? 'end' : 'start';
  const baseline = verticalCenter ? 'central' : 'hanging';
  const y = verticalCenter ? t.y + t.h / 2 : t.y;

  const attrs = [
    `x="${t.x}"`,
    `y="${y}"`,
    `fill="${escapeXml(textFill(el))}"`,
    `font-size="${fontSize}"`,
    `font-weight="${fontWeight}"`,
    `font-family="${escapeXml(fontFamily)}"`,
    `text-anchor="${anchor}"`,
    `dominant-baseline="${baseline}"`,
    ...(letterSpacing !== undefined ? [`letter-spacing="${letterSpacing}"`] : []),
  ].join(' ');

  return `<text ${attrs}>${escapeXml(el.text.content)}</text>`;
}

function renderFrame(el: Element & { type: 'frame' | 'autoLayout' }): string {
  const t = el.transform;
  if (!t) return '';
  const radius = (el.style as Record<string, unknown> | undefined)?.borderRadius as
    | number
    | undefined;
  const fill = el.fill?.color ? rgbaToCss(el.fill.color) : 'none';
  const strokeColor = el.stroke?.color ? rgbaToCss(el.stroke.color) : 'none';
  const strokeWidth = el.stroke?.width ?? (el.fill?.color ? 0 : 1);

  const attrs = [
    `x="${t.x}"`,
    `y="${t.y}"`,
    `width="${t.w}"`,
    `height="${t.h}"`,
    `fill="${fill}"`,
    `stroke="${strokeColor}"`,
    `stroke-width="${strokeWidth}"`,
    ...(radius !== undefined ? [`rx="${radius}"`] : []),
  ].join(' ');

  return `<rect ${attrs}/>`;
}

function renderVector(el: Element & { type: 'vector' }): string {
  const d = el.paths.join(' ');
  const fill = el.fill?.color ? rgbaToCss(el.fill.color) : 'none';
  const strokeColor = el.stroke?.color ? rgbaToCss(el.stroke.color) : 'none';
  const strokeWidth = el.stroke?.width ?? 1;
  const dash = (el.style as Record<string, unknown> | undefined)?.strokeDasharray as
    | string
    | undefined;

  const attrs = [
    `d="${escapeXml(d)}"`,
    `fill="${fill}"`,
    `stroke="${strokeColor}"`,
    `stroke-width="${strokeWidth}"`,
    ...(dash !== undefined ? [`stroke-dasharray="${escapeXml(dash)}"`] : []),
  ].join(' ');

  return `<path ${attrs}/>`;
}

function renderImage(el: Element & { type: 'image' }): string {
  const t = el.transform;
  if (!t) return '';
  const alt = el.alt ?? el.assetId;
  return `<rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" fill="#6366f1" opacity="0.35" rx="6"><title>${escapeXml(alt)}</title></rect>`;
}

function renderComponent(el: Element & { type: 'component' }): string {
  const expanded = expandComponent(el);
  return expanded.map((child) => renderElement(child)).join('\n');
}

function renderPlaceholder(el: Element): string {
  const t = el.transform;
  if (!t) return '';
  return `<rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" fill="#6366f1" opacity="0.5"/>`;
}

function renderElement(el: Element): string {
  switch (el.type) {
    case 'frame':
    case 'autoLayout':
      return renderFrame(el);
    case 'text':
      return renderText(el);
    case 'vector':
      return renderVector(el);
    case 'image':
      return renderImage(el);
    case 'component':
      return renderComponent(el);
    default:
      return renderPlaceholder(el);
  }
}

// ---------------------------------------------------------------------------
// Slide & poster rendering
// ---------------------------------------------------------------------------

export interface RenderResult {
  svg: string;
  width: number;
  height: number;
  placeholderCount: number;
}

/** Standard slide dimensions at 1× (matches default aspect ratio 16:9). */
const DEFAULT_SLIDE_W = 1920;
const DEFAULT_SLIDE_H = 1080;

/**
 * Render a single slide to SVG.
 */
function renderSlideToSvg(slide: Slide, index: number): { svg: string; placeholderCount: number } {
  const w = slide.aspect?.ratioW ?? DEFAULT_SLIDE_W;
  const h = slide.aspect?.ratioH ?? DEFAULT_SLIDE_H;
  const vw = slide.aspect?.ratioW ?? DEFAULT_SLIDE_W;
  const vh = slide.aspect?.ratioH ?? DEFAULT_SLIDE_H;

  const elements = slide.elements ?? [];
  let placeholderCount = 0;

  const innerParts: string[] = [];
  for (const el of elements) {
    // Count text elements as "placeholders" for the manifest.
    if (el.type === 'text') placeholderCount++;
    const svg = renderElement(el);
    if (svg) innerParts.push(svg);
  }

  const inner = innerParts.map((s) => `  ${s}`).join('\n');
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="${w}" height="${h}">`,
    `  <title>Slide ${index + 1}</title>`,
    inner,
    '</svg>',
  ].join('\n');

  return { svg, placeholderCount };
}

/**
 * Render a full-deck poster as a single SVG containing all slides stacked
 * vertically with spacing.
 */
export function renderDeckPoster(deckJson: Record<string, unknown>): RenderResult {
  const slides = (deckJson as { slides?: Slide[] }).slides ?? [];
  const slideWidth = DEFAULT_SLIDE_W;
  const slideHeight = DEFAULT_SLIDE_H;
  const spacing = 40;
  const totalHeight =
    slides.length === 0 ? 0 : slides.length * slideHeight + (slides.length - 1) * spacing;

  let totalPlaceholderCount = 0;
  const slideParts: string[] = [];

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i]!;
    const y = i * (slideHeight + spacing);
    const { svg: innerSvg, placeholderCount } = renderSlideToSvg(slide, i);
    totalPlaceholderCount += placeholderCount;
    slideParts.push(
      `<g transform="translate(0,${y})">\n${innerSvg
        .split('\n')
        .map((l) => `  ${l}`)
        .join('\n')}\n</g>`,
    );
  }

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${slideWidth} ${totalHeight}" width="${slideWidth}" height="${totalHeight}">`,
    ...slideParts.map((s) => `  ${s}`),
    '</svg>',
  ].join('\n');

  return {
    svg,
    width: slideWidth,
    height: totalHeight,
    placeholderCount: totalPlaceholderCount,
  };
}

/**
 * Render individual slide previews as separate SVG strings.
 */
export function renderSlidePreviews(
  deckJson: Record<string, unknown>,
  slideIndexes?: number[],
): string[] {
  const slides = (deckJson as { slides?: Slide[] }).slides ?? [];
  const indexes = slideIndexes ?? slides.map((_, i) => i);

  return indexes
    .filter((i) => i >= 0 && i < slides.length)
    .map((i) => renderSlideToSvg(slides[i]!, i).svg);
}
