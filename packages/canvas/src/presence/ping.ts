/**
 * Local ping — Cmd+Shift+P emits a 1.2 s expanding ring at the cursor.
 * Rate limit 1 per 2 s. See docs/development_phases/phase-03 §F.3.
 */

export interface LocalPing {
  id: string;
  cursor: { x: number; y: number };
  startAt: number;
  durationMs: number;
}

export class LocalPingAdapter {
  private readonly minGapMs: number;
  private readonly pings: LocalPing[] = [];
  private lastEmitAt: number | null = null;

  constructor(options: { minGapMs?: number } = {}) {
    this.minGapMs = options.minGapMs ?? 2000;
  }

  canEmit(now: number = Date.now()): boolean {
    if (this.lastEmitAt === null) return true;
    return now - this.lastEmitAt >= this.minGapMs;
  }

  emit(cursor: { x: number; y: number }, now: number = Date.now()): LocalPing | null {
    if (!this.canEmit(now)) return null;
    this.lastEmitAt = now;
    const ping: LocalPing = {
      id: `ping-${now}`,
      cursor,
      startAt: now,
      durationMs: 1200,
    };
    this.pings.push(ping);
    return ping;
  }

  active(now: number = Date.now()): LocalPing[] {
    return this.pings.filter((ping) => now - ping.startAt < ping.durationMs);
  }

  clear(): void {
    this.pings.length = 0;
  }
}