/**
 * apps/presenter — analytics events barrel.
 */

export { emitPresenterEvent, presenterEmitHelpers } from './presenter_event.js';
export {
  initializePresenterAnalytics,
  getPresenterAnalyticsClient,
  _resetPresenterAnalyticsForTests,
} from './init.js';
export type { PresenterEmitContext, PresenterEventPayload } from './presenter_event.js';
export type { PresenterInitOptions } from './init.js';
