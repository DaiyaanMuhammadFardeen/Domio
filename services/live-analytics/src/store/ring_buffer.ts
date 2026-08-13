/**
 * Live-analytics — per-session ring buffer (Phase 17 W10).
 *
 * Holds the last `capacity` LiveEvent records per session in insertion
 * order. The buffer is used both as the source for the pulse
 * derivation (pulse.ts) and as the replay window when a new WebSocket
 * subscriber joins (ws/hud.ts).
 *
 * The buffer is keyed by `${workspace_id}|${session_id}` so two
 * sessions in the same workspace never collide.
 */

import type { LiveEvent } from '../types.js';

export interface RingBuffer {
  push(event: LiveEvent): void;
  /** Snapshot the current buffer in insertion order. */
  snapshot(workspace_id: string, session_id: string): LiveEvent[];
  size(workspace_id: string, session_id: string): number;
  /** Forget a session — called after summary write. */
  drop(workspace_id: string, session_id: string): void;
  /** Number of sessions currently buffered. */
  sessionCount(): number;
}

export function buildRingBuffer(capacity: number): RingBuffer {
  const buffers = new Map<string, LiveEvent[]>();

  function key(workspace_id: string, session_id: string): string {
    return `${workspace_id}|${session_id}`;
  }

  return {
    push(event) {
      const k = key(event.workspace_id, event.session_id);
      let buf = buffers.get(k);
      if (!buf) {
        buf = [];
        buffers.set(k, buf);
      }
      buf.push(event);
      if (buf.length > capacity) {
        buf.splice(0, buf.length - capacity);
      }
    },
    snapshot(workspace_id, session_id) {
      const buf = buffers.get(key(workspace_id, session_id));
      return buf ? buf.slice() : [];
    },
    size(workspace_id, session_id) {
      return buffers.get(key(workspace_id, session_id))?.length ?? 0;
    },
    drop(workspace_id, session_id) {
      buffers.delete(key(workspace_id, session_id));
    },
    sessionCount() {
      return buffers.size;
    },
  };
}
