/**
 * @domio/thumbnail — domain types.
 *
 * A thumbnail represents a server-rendered raster of a slide at a given
 * size. We cache by (deck_version_id, slide_id, size) — the version
 * aspect is important because slide content can change across deck
 * versions and we want cache hits to be correct.
 */

export type ThumbnailSize = 'sm' | 'md' | 'lg';

export interface ThumbnailSizeSpec {
  width: number;
  height: number;
  /** JPEG quality 1-100 (only used for the bitmap producer). */
  quality: number;
}

export const THUMBNAIL_SIZES: Record<ThumbnailSize, ThumbnailSizeSpec> = {
  sm: { width: 240, height: 135, quality: 70 },
  md: { width: 480, height: 270, quality: 75 },
  lg: { width: 960, height: 540, quality: 80 },
};

export interface ThumbnailRecord {
  workspace_id: string;
  deck_id: string;
  /** The deck version this thumb was rendered against. */
  deck_version_id: string;
  slide_id: string;
  size: ThumbnailSize;
  /** Opaque blob (PNG or JPEG bytes). */
  bytes: Uint8Array;
  content_type: string;
  rendered_at_ms: number;
  /** Hash of the input we rendered from — used to detect slide mutations
   *  that bypass the deck-version machinery. */
  source_hash: string;
}

export interface ThumbnailRef {
  workspace_id: string;
  deck_id: string;
  deck_version_id: string;
  slide_id: string;
  size: ThumbnailSize;
  /** CDN URL or signed storage URL. */
  url: string;
  content_type: string;
  width: number;
  height: number;
  rendered_at_ms: number;
}

export interface RenderInput {
  workspace_id: string;
  deck_id: string;
  deck_version_id: string;
  slide_id: string;
  size: ThumbnailSize;
  /** Source bytes of the slide's scene-graph (used to derive source_hash). */
  scene_graph: JsonObject;
}

export type JsonObject = Record<string, unknown>;

export class ThumbnailError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'ThumbnailError';
  }
}

export class ThumbnailNotFoundError extends ThumbnailError {
  readonly code = 'THUMBNAIL_NOT_FOUND' as const;
  constructor(message = 'thumbnail not found') {
    super('THUMBNAIL_NOT_FOUND', message);
    this.name = 'ThumbnailNotFoundError';
  }
}

export class ThumbnailRenderError extends ThumbnailError {
  readonly code = 'THUMBNAIL_RENDER_ERROR' as const;
  constructor(message = 'thumbnail render failed') {
    super('THUMBNAIL_RENDER_ERROR', message);
    this.name = 'ThumbnailRenderError';
  }
}
