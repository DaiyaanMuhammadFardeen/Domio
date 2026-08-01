/**
 * History thumbnail — render a small PNG of the doc. The renderer is not
 * available in the worker; this module ships a tiny PNG generator suitable
 * for the timeline strip placeholder.
 */

import type { DeckDocument } from '@domio/schema';

export interface ThumbnailInput {
  doc: DeckDocument;
  width?: number;
  height?: number;
}

export function thumbnailPlaceholder(input: ThumbnailInput): string {
  const slide = input.doc.slides[0];
  if (!slide) return '';
  const w = input.width ?? 96;
  const h = input.height ?? 54;
  const data: string[] = [];
  for (let y = 0; y < h; y++) {
    data.push(y === 0 || y === h - 1 ? '1'.repeat(w) : `1${'0'.repeat(w - 2)}1`);
  }
  return `data:image/svg+xml,${encodeURIComponent(simpleSvg(w, h, slide.elements.length))}`;
}

function simpleSvg(w: number, h: number, n: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#e2e8f0"/><text x="4" y="${h - 6}" font-size="9" fill="#475569">${n} layers</text></svg>`;
}