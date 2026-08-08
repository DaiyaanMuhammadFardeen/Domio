/**
 * @domio/library-propagator — Phase 18 Wave 3 library auto-update propagator.
 *
 * Worker that periodically checks for bindings that need syncing
 * and applies the propagation.
 *
 * Modules:
 *   propagator.ts — timer-based tick loop
 *   index.ts — barrel + main entry
 */

export { PropagatorWorker } from './propagator.js';
export type { PropagationResult, Logger } from './propagator.js';
