/**
 * apps/viewer — analytics events barrel.
 *
 * Phase 17 emit helpers are imported from this barrel so the rest of
 * the app doesn't need to know the layout.
 */

export { emitView, emitInteraction, emitScrollProgress, emitScrollPause } from './view.js';
export { initializeAnalytics, getAnalyticsClient, _resetAnalyticsForTests } from './init.js';
export type { ViewerEmitContext, ViewerEvent } from './view.js';
export type { InitOptions } from './init.js';
