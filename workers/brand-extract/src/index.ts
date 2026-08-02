/**
 * @domio/brand-extract-worker — Phase 07 URL → brand kit extractor.
 *
 * Public API:
 *
 *  - {@link extractBrandKit} — produce a {@link BrandExtractionResult}
 *    from a `(url, html)` input.  Pure function — no network I/O.
 *  - {@link paletteTokensToTokenIds} — convert a palette into a list
 *    of `(tokenId, hex)` pairs in the `color.brand.*` namespace.
 *
 * The worker entry point (not implemented here) wraps
 * `extractBrandKit` in a NATS consumer that publishes the result
 * on `brand.extract.completed`.
 */

export * from './extractor.js';
