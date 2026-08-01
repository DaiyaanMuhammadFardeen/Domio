/**
 * Domio control-plane — Phase 02 stub.
 *
 * Phase 02 owns the Deck & Schema module (loader + repository). The
 * service skeleton is in place so the editor and viewer can be wired to
 * `DocumentLoader` directly.
 *
 * Real persistence, RLS-aware connection pooling, and outbox events land
 * in Phase 04 / 05.
 */

export * from './deck/loader.js';