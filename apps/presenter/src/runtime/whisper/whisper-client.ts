'use client';

/**
 * WhisperClient — presenter-only whisper channel.
 *
 * Phase 15 W15. The whisper channel rides through the realtime gateway
 * subject `realtime.session.{id}.whisper` and is gated to the presenter
 * view only — the audience never receives whisper messages. For the
 * client-side stub, this module just maintains a local ring buffer and
 * exposes a tiny pub/sub for components to subscribe.
 *
 * The WS bridge wires this client to the realtime gateway once the
 * participant-ws-gateway lands in P16 W1.
 */

export interface WhisperMessage {
  id: string;
  session_id: string;
  author_id: string;
  author_display_name?: string;
  text: string;
  /** Visible-for (ms). After this the message is purged from the ring. */
  expires_at_ms: number;
  ts_ms: number;
}

export type WhisperListener = (msg: WhisperMessage) => void;

export class WhisperClient {
  private readonly listeners = new Set<WhisperListener>();
  private readonly ring: WhisperMessage[] = [];
  private readonly capacity: number;

  constructor(opts: { capacity?: number } = {}) {
    this.capacity = opts.capacity ?? 50;
  }

  publish(msg: WhisperMessage): void {
    this.ring.push(msg);
    if (this.ring.length > this.capacity) this.ring.shift();
    this.gc();
    for (const l of this.listeners) {
      try {
        l(msg);
      } catch {
        /* ignore */
      }
    }
  }

  subscribe(listener: WhisperListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Snapshot of recent messages (already purged of expired ones). */
  snapshot(): WhisperMessage[] {
    this.gc();
    return this.ring.slice();
  }

  private gc(): void {
    const now = Date.now();
    while (this.ring.length > 0 && this.ring[0]!.expires_at_ms <= now) {
      this.ring.shift();
    }
  }
}
