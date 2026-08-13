/**
 * Notification dispatcher — NATS subscription manager.
 *
 * Subscribes to two NATS subjects and dispatches to caller-provided
 * handlers. The manager is fully dependency-injected: the caller
 * supplies a `nc` (NatsConnection) and `sc` (StringCodec) so that
 * unit tests can inject fakes without touching a real NATS server.
 *
 * Subjects:
 *   - `crm.sync.events`           — CRM pipeline sync events.
 *   - `collab.events.>`           — collaboration events (wildcard).
 *     Gated behind the `collabEnabled` flag.
 *
 * Error semantics:
 *   - Invalid JSON payloads → logged + skipped (never crash).
 *   - Handler errors → caught per-message, logged, loop continues.
 */

import type { NatsConnection, Codec, Subscription } from 'nats';

// ─── Types ──────────────────────────────────────────────────────

export interface NatsManagerHandlers {
  /** Called for every valid message on `crm.sync.events`. */
  onCrmEvent: (raw: string) => Promise<void>;
  /** Called for every valid message on `collab.events.*`. */
  onCollabEvent: (raw: string) => Promise<void>;
}

export interface NatsManagerDeps {
  nc: NatsConnection;
  sc: Codec<string>;
  handlers: NatsManagerHandlers;
  /** When false the collab subscription is skipped entirely. */
  collabEnabled: boolean;
  /** Prefix for log lines (default: 'notification-dispatcher'). */
  logPrefix?: string;
}

// ─── Subscription manager ───────────────────────────────────────

export class NatsSubscriptionManager {
  private readonly deps: NatsManagerDeps;
  private readonly subs: Subscription[] = [];
  private readonly prefix: string;

  constructor(deps: NatsManagerDeps) {
    this.deps = deps;
    this.prefix = deps.logPrefix ?? 'notification-dispatcher';
  }

  /**
   * Wire up subscriptions for both subjects. Each subscription uses
   * a callback-based form so messages are handled as they arrive.
   * Returns the number of subscriptions opened.
   */
  start(): number {
    // ── CRM sync events ────────────────────────────────────────
    this.subs.push(
      this.deps.nc.subscribe('crm.sync.events', {
        callback: (_err, msg) => {
          this.handleMessage(msg.data, 'crm.sync.events', this.deps.handlers.onCrmEvent);
        },
      }),
    );

    // ── Collaboration events (gated) ───────────────────────────
    if (this.deps.collabEnabled) {
      this.subs.push(
        this.deps.nc.subscribe('collab.events.>', {
          callback: (_err, msg) => {
            this.handleMessage(msg.data, msg.subject, this.deps.handlers.onCollabEvent);
          },
        }),
      );
    }

    this.log('subscriptions_opened', {
      count: this.subs.length,
      subjects: this.subs.map((s) => s.getSubject()),
    });

    return this.subs.length;
  }

  /**
   * Drain and close all subscriptions. Safe to call multiple times.
   */
  async stop(): Promise<void> {
    for (const sub of this.subs) {
      try {
        await sub.unsubscribe();
      } catch {
        // Best-effort: unsubscribe errors are not fatal.
      }
    }
    this.subs.length = 0;
  }

  // ── Internal helpers ─────────────────────────────────────────

  private handleMessage(
    data: Uint8Array,
    subject: string,
    handler: (raw: string) => Promise<void>,
  ): void {
    let raw: string;
    try {
      raw = this.deps.sc.decode(data);
    } catch (err) {
      this.log('message_decode_failed', {
        subject,
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    // Validate JSON shape — skip invalid payloads.
    try {
      JSON.parse(raw);
    } catch (err) {
      this.log('message_invalid_json', {
        subject,
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    // Delegate to the handler; swallow errors to keep the loop alive.
    handler(raw).catch((err) => {
      this.log('handler_error', {
        subject,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  private log(msg: string, extra?: Record<string, unknown>): void {
    console.log(JSON.stringify({ msg: `${this.prefix}: ${msg}`, ...extra }));
  }
}

// ─── Connection factory ─────────────────────────────────────────

export interface ConnectOptions {
  servers?: string;
  maxReconnect?: number;
  logPrefix?: string;
}

/**
 * connectWithRetry attempts to establish a NATS connection with a
 * simple linear back-off. Returns `null` when all attempts are
 * exhausted (the caller should run in degraded mode).
 */
export async function connectWithRetry(opts: ConnectOptions = {}): Promise<NatsConnection | null> {
  const { connect } = await import('nats');
  const servers = opts.servers ?? process.env.NATS_URL ?? 'nats://localhost:4222';
  const maxAttempts = opts.maxReconnect ?? Number(process.env.NATS_MAX_RECONNECT ?? 3);
  const prefix = opts.logPrefix ?? 'notification-dispatcher';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const nc = await connect({ servers });
      console.log(
        JSON.stringify({
          msg: `${prefix}: nats_connected`,
          servers,
          attempt,
        }),
      );
      return nc;
    } catch (err) {
      console.log(
        JSON.stringify({
          msg: `${prefix}: nats_connect_retry`,
          servers,
          attempt,
          maxAttempts,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      if (attempt < maxAttempts) {
        await sleep(1_000);
      }
    }
  }

  console.log(
    JSON.stringify({
      msg: `${prefix}: nats_connect_failed_degraded`,
      servers,
      maxAttempts,
    }),
  );
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
