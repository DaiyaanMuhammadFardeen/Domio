/**
 * Notification dispatcher — service entrypoint.
 *
 * Wires the rules engine, channel router, daily-cap store, and
 * audit logger into a process that subscribes to NATS subject
 * `crm.sync.events` and dispatches notifications on each
 * incoming event.
 *
 * The main loop is intentionally left as a placeholder for the
 * next milestone — Phase 17 W8 ships the building blocks
 * (rules, channels, caps, redaction, dispatcher) and the
 * subscription loop lands once `crm.sync.events` is finalized.
 */

import { evaluateAll } from './rules/evaluate.js';
import {
  Router,
  SlackSender,
  TeamsSender,
  EmailSender,
  InAppSender,
  WebhookSender,
  type EmailTransport,
  type NatsPublisher,
} from './channels/router.js';
import { MemoryDailyCap } from './caps/daily.js';
import { NoopAuditWriter } from './audit/redact.js';
import { Dispatcher } from './dispatcher.js';
import type { CRMSyncEvent } from './types.js';

async function main() {
  const natsUrl = process.env.NATS_URL ?? 'nats://localhost:4222';
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

  // ─── Channel router ──────────────────────────────────────────
  // For v1 we use a no-op email transport. Production wires
  // nodemailer + SMTP; the transport is pluggable so this stays
  // a one-line swap.
  const emailTransport: EmailTransport = {
    send: async () => ({ ok: true }),
  };
  const nats: NatsPublisher = {
    publish: async () => { /* NATS publisher is set up below */ },
  };
  const router = new Router([
    new SlackSender(),
    new TeamsSender(),
    new EmailSender(emailTransport),
    new InAppSender(nats),
    new WebhookSender(),
  ]);

  // ─── Daily-cap store (Redis) ────────────────────────────────
  // We use MemoryDailyCap here so the process can boot without
  // a Redis dependency; production swaps in RedisDailyCap.
  const caps = new MemoryDailyCap();

  // ─── Audit writer ───────────────────────────────────────────
  // NoopAuditWriter for v1; production wires a Postgres writer.
  const audit = new NoopAuditWriter();

  // ─── Dispatcher ─────────────────────────────────────────────
  const dispatcher = new Dispatcher({ router, caps, audit });

  // ─── NATS subscriber (placeholder) ──────────────────────────
  console.log(JSON.stringify({
    msg: 'notification-dispatcher: starting',
    nats: natsUrl,
    redis: redisUrl,
    channels: ['slack', 'teams', 'email', 'in_app', 'webhook'],
  }));

  // Test-only: if NOTIFICATION_DISPATCHER_TEST_EVENT is set, evaluate
  // and dispatch a single event from the environment. This lets the
  // smoke test exercise the wiring without a NATS broker.
  const testEvent = process.env.NOTIFICATION_DISPATCHER_TEST_EVENT;
  if (testEvent) {
    const event: CRMSyncEvent = JSON.parse(testEvent);
    const rules: Array<import('./types.js').NotificationRule> = [];
    const rows = await dispatcher.dispatch(rules, event);
    console.log(JSON.stringify({
      msg: 'notification-dispatcher: test event processed',
      notifications: rows.length,
      rows,
    }));
  }

  // Touch evaluateAll so the import isn't tree-shaken when we run
  // with the test event above (also documents that this is the
  // public entry point for the rules engine).
  void evaluateAll;
}

main().catch((err) => {
  console.error(`notification-dispatcher: startup failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
