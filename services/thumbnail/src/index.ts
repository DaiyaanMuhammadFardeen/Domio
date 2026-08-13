/**
 * @domio/thumbnail — public surface.
 *
 * Phase 15 W3: per-deck thumbnail cache + render-on-demand + CDN-signed
 * URLs for the presenter jump grid.
 *
 * Public exports:
 *  - `ThumbnailService`, `ThumbnailServiceOptions`
 *  - `ThumbnailCache`, `InMemoryThumbnailCache`, `NullThumbnailCache`
 *  - `RenderProducer`, `BitmapRenderProducer`
 *  - `TitleIndex` — in-memory title search for the jump grid.
 *  - `verifyCdnSignature` — gateway-side URL verifier.
 *  - Domain types: `ThumbnailRecord`, `ThumbnailRef`, `ThumbnailSize`,
 *    `THUMBNAIL_SIZES`.
 *  - Errors: `ThumbnailError`, `ThumbnailNotFoundError`,
 *    `ThumbnailRenderError`.
 */

export * from './types.js';
export * from './cache.js';
export * from './render.js';
export * from './service.js';
