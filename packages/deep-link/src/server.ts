/**
 * @domio/deep-link — server-only surface.
 *
 * Re-exports Shortener and friends that depend on `node:crypto`
 * and must NOT be pulled into client bundles.
 */

export { Shortener, newShortId, type ShortenInput, type ShortLinkStore } from './shortener.js';
