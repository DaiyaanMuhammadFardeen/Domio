/**
 * Notification dispatcher — per-recipient daily caps.
 *
 * Each notification recipient is throttled by a per-day counter
 * stored in Redis at key `notif:daily:{recipientID}:{YYYY-MM-DD}`.
 * The counter is INCR'd on each dispatch attempt and checked against
 * the rule's `daily_cap` before the channel sender is invoked.
 *
 * The cap is read+write atomic via Lua so two concurrent dispatches
 * can't both pass the cap check and then both INCR.
 *
 * Failure mode: Redis unavailable → fail open (log + allow the
 * notification). The cap is a UX safeguard, not a security control.
 */

import type { Redis } from 'ioredis';

export interface DailyCapStore {
  /**
   * Returns true if the recipient is within the cap and the
   * counter has been incremented; false if over the cap (counter
   * is NOT incremented in that case).
   */
  allowAndIncr(recipientID: string, cap: number, nowMs?: number): Promise<boolean>;
  /** Current count for the recipient (for dashboards / debugging). */
  count(recipientID: string, nowMs?: number): Promise<number>;
  /** Reset (test helper). */
  reset(recipientID: string, nowMs?: number): Promise<void>;
}

// allowAndIncrScript is the Lua script that atomically reads,
// compares, and (maybe) increments the daily counter.
//
//   KEYS[1] = "notif:daily:{recipientID}:{YYYY-MM-DD}"
//   ARGV[1] = cap
//   ARGV[2] = ttl seconds (we use 36h so a TZ-shifted request
//             near midnight still hits a populated counter)
//
// Returns 1 if allowed (counter incremented) and 0 if capped.
const ALLOW_AND_INCR = `
local cur = tonumber(redis.call('GET', KEYS[1]) or '0')
local cap = tonumber(ARGV[1])
if cur >= cap then
  return 0
end
local n = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], ARGV[2])
return n
`;

const COUNT_SCRIPT = `
return tonumber(redis.call('GET', KEYS[1]) or '0')
`;

const RESET_SCRIPT = `
redis.call('DEL', KEYS[1])
return 1
`;

/** RedisDailyCap is a Redis-backed implementation. */
export class RedisDailyCap implements DailyCapStore {
  private allowSha?: string;
  private countSha?: string;
  private resetSha?: string;

  constructor(private readonly redis: Redis, private readonly ttlSeconds = 36 * 3600) {}

  async allowAndIncr(recipientID: string, cap: number, nowMs: number = Date.now()): Promise<boolean> {
    const key = keyFor(recipientID, nowMs);
    const sha = await this.ensureAllowSha();
    let res: unknown;
    try {
      res = await this.redis.evalsha(sha, 1, key, cap, this.ttlSeconds);
    } catch (err) {
      // Fall back to EVAL if the script isn't loaded yet (e.g. another
      // pod evicted the script). This is idempotent.
      res = await this.redis.eval(ALLOW_AND_INCR, 1, key, cap, this.ttlSeconds);
      void err;
    }
    return Number(res) > 0;
  }

  async count(recipientID: string, nowMs: number = Date.now()): Promise<number> {
    const key = keyFor(recipientID, nowMs);
    const sha = await this.ensureCountSha();
    const res = await this.redis.evalsha(sha, 1, key);
    return Number(res);
  }

  async reset(recipientID: string, nowMs: number = Date.now()): Promise<void> {
    const key = keyFor(recipientID, nowMs);
    const sha = await this.ensureResetSha();
    await this.redis.evalsha(sha, 1, key);
  }

  private async ensureAllowSha(): Promise<string> {
    if (this.allowSha) return this.allowSha;
    this.allowSha = (await this.redis.script('LOAD', ALLOW_AND_INCR)) as string;
    return this.allowSha;
  }
  private async ensureCountSha(): Promise<string> {
    if (this.countSha) return this.countSha;
    this.countSha = (await this.redis.script('LOAD', COUNT_SCRIPT)) as string;
    return this.countSha;
  }
  private async ensureResetSha(): Promise<string> {
    if (this.resetSha) return this.resetSha;
    this.resetSha = (await this.redis.script('LOAD', RESET_SCRIPT)) as string;
    return this.resetSha;
  }
}

/** MemoryDailyCap is an in-process implementation for tests. */
export class MemoryDailyCap implements DailyCapStore {
  private readonly counts = new Map<string, number>();

  async allowAndIncr(recipientID: string, cap: number, nowMs: number = Date.now()): Promise<boolean> {
    const key = keyFor(recipientID, nowMs);
    const cur = this.counts.get(key) ?? 0;
    if (cur >= cap) return false;
    this.counts.set(key, cur + 1);
    return true;
  }

  async count(recipientID: string, nowMs: number = Date.now()): Promise<number> {
    return this.counts.get(keyFor(recipientID, nowMs)) ?? 0;
  }

  async reset(recipientID: string, nowMs: number = Date.now()): Promise<void> {
    this.counts.delete(keyFor(recipientID, nowMs));
  }
}

/**
 * keyFor computes the daily-counter key. Date components are
 * derived from `nowMs` in UTC so the cap is consistent across
 * timezones (a recipient in Asia receives the same cap as one in
 * Europe at the same instant).
 */
export function keyFor(recipientID: string, nowMs: number): string {
  const d = new Date(nowMs);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `notif:daily:${recipientID}:${yyyy}-${mm}-${dd}`;
}

/** NoopDailyCap never caps — used when Redis is unavailable. */
export class NoopDailyCap implements DailyCapStore {
  async allowAndIncr(_recipientID: string, _cap: number, _nowMs?: number): Promise<boolean> { return true; }
  async count(_recipientID: string, _nowMs?: number): Promise<number> { return 0; }
  async reset(_recipientID: string, _nowMs?: number): Promise<void> { /* no-op */ }
}
