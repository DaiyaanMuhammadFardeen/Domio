/**
 * @domio/animation-runtime — Trigger resolver.
 *
 * Registers triggers and fires them with debounce and per-slide cap.
 */

import type { Trigger, TriggerKind } from './types.js';

const DEBOUNCE_MS = 250;
const MAX_SIMULTANEOUS_TRIGGERS = 16;

interface RegisteredTrigger {
  timelineId: string;
  trigger: Trigger;
  /** Last fire timestamp for debounce. */
  lastFireTime: number;
}

interface FirePayload {
  sourceId?: string;
  fieldPath?: string;
  [key: string]: unknown;
}

export class TriggerResolver {
  /** Registered triggers grouped by kind. */
  private triggers = new Map<TriggerKind, RegisteredTrigger[]>();
  /** Callback invoked when triggers fire. */
  private onFire: (timelineId: string, trigger: Trigger) => void;
  /** Count of simultaneous triggers in current "slide" (fire batch). */
  private simultaneousCount = 0;
  /** Timestamp of the current fire batch. */
  private batchTimestamp = 0;

  constructor(onFire: (timelineId: string, trigger: Trigger) => void) {
    this.onFire = onFire;
  }

  /** Register a trigger for a timeline. */
  registerTrigger(timelineId: string, trigger: Trigger): void {
    const list = this.triggers.get(trigger.kind) ?? [];
    list.push({
      timelineId,
      trigger,
      lastFireTime: 0,
    });
    this.triggers.set(trigger.kind, list);
  }

  /** Remove all triggers for a timeline. */
  unregisterTimeline(timelineId: string): void {
    for (const [kind, list] of this.triggers) {
      const filtered = list.filter((t) => t.timelineId !== timelineId);
      if (filtered.length === 0) {
        this.triggers.delete(kind);
      } else {
        this.triggers.set(kind, filtered);
      }
    }
  }

  /**
   * Fire triggers of a given kind.
   * Returns the list of timeline IDs that were triggered.
   */
  fire(kind: TriggerKind, payload?: FirePayload): string[] {
    const now = Date.now();
    const firedTimelines: string[] = [];

    // Reset batch counter if new batch
    if (now - this.batchTimestamp > DEBOUNCE_MS) {
      this.simultaneousCount = 0;
    }
    this.batchTimestamp = now;

    const registered = this.triggers.get(kind) ?? [];
    for (const entry of registered) {
      // Check per-slide cap
      if (this.simultaneousCount >= MAX_SIMULTANEOUS_TRIGGERS) {
        break;
      }

      // Debounce check
      const debounceMs = entry.trigger.debounceMs ?? DEBOUNCE_MS;
      if (now - entry.lastFireTime < debounceMs) {
        continue;
      }

      // For on_data_change, match (sourceId, fieldPath)
      if (kind === 'on_data_change' && payload) {
        if (
          entry.trigger.sourceId !== payload.sourceId ||
          entry.trigger.fieldPath !== payload.fieldPath
        ) {
          continue;
        }
      }

      // For on_timer, reject negative offsetMs
      if (kind === 'on_timer') {
        const offset = entry.trigger.offsetMs ?? 0;
        if (offset < 0) {
          continue;
        }
      }

      entry.lastFireTime = now;
      this.simultaneousCount++;
      firedTimelines.push(entry.timelineId);
      this.onFire(entry.timelineId, entry.trigger);
    }

    return firedTimelines;
  }
}
