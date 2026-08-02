/**
 * @domio/components — the curated canvas component pack.
 *
 * Exposes the component catalog (Insert panel + prop engine source of
 * truth), schema-prop integration, and the renderer-facing expansion.
 */

export * from './types.js';
export * from './id.js';
export * from './tokens.js';
export * from './helpers.js';
export * from './catalog.js';
export * from './expand.js';

export { validateProps } from '@domio/schema-prop';
