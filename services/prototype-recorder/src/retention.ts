/**
 * Prototype-recorder service — PDPA retention cron (Phase 10 M5).
 *
 * Hard-deletes expired sessions and their events. Operators schedule this
 * via a 24-hour cron. The function is idempotent: calling it twice in a
 * row is a no-op the second time.
 *
 * SLA: every `expires_at < now - 24h` session is gone within 24 hours
 * of expiry. Sessions closer to expiry than 24 hours get caught by the
 * next run.
 */

import type { PrototypeRecorderService } from './service.js';

export interface RetentionReport {
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly deletedSessions: number;
  readonly deletedEvents: number;
}

export async function runRetention(
  service: PrototypeRecorderService,
  opts?: { readonly now?: () => number },
): Promise<RetentionReport> {
  const clock = opts?.now ?? (() => Date.now());
  const startedAt = clock();
  const result = await service.runRetention(startedAt);
  const finishedAt = clock();
  return {
    startedAt,
    finishedAt,
    deletedSessions: result.deletedSessions,
    deletedEvents: result.deletedEvents,
  };
}
