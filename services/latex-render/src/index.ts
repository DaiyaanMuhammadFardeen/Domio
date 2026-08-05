/**
 * @domio/latex-render — Phase 11 LaTeX render service.
 *
 * KaTeX-powered server-side LaTeX rendering for scientific decks.
 * Edge-render semantics: fast, cached, no heavy runtime.
 *
 * Public surface:
 *
 *  - {@link createLatexRoutes} — Hono route handlers.
 *  - {@link RenderCache} — injectable render cache with TTL.
 *  - {@link renderLatex} — KaTeX render pipeline.
 *  - {@link validateSafeSubset} — safe-subset gate.
 */

export * from './safesubset.js';
export * from './render.js';
export * from './cache.js';
export * from './routes.js';
