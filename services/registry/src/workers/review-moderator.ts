import type { ServiceDeps } from '../deps.js';
import { runModerationQueue } from '../marketplace/reviews.js';

/** In-process guard to prevent overlapping moderation runs. */
let running = false;

/**
 * Drain the review moderation queue.
 * Returns 0 if a run is already in progress (non-overlapping guard).
 */
export async function run(deps: ServiceDeps): Promise<number> {
  if (running) return 0;
  running = true;
  try {
    return await runModerationQueue(deps);
  } finally {
    running = false;
  }
}
