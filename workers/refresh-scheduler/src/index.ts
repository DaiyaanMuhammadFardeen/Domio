/**
 * @domio/refresh-scheduler — Phase 08 M2 query refresh scheduler.
 *
 * Worker that schedules and executes query refreshes based on
 * freshness policies (eager + on_interval).
 *
 * Modules:
 *   scheduler.ts — timer-based scheduling with drift ≤1s
 *   refresh.ts — query execution + freshness recording
 *   index.ts — worker entry + graceful shutdown
 */

export { RefreshScheduler } from './scheduler.js';
export type { ScheduledQuery, SchedulerCallbacks, SchedulerOptions } from './scheduler.js';
export { refreshQuery } from './refresh.js';
export type { DatasetSnapshot, FreshnessRecord, RefreshCallbacks } from './refresh.js';
export type { QueryRecord, FreshnessPolicy, FreshnessPolicyType } from './scheduler.js';
