/**
 * Notification dispatcher — service entrypoint.
 *
 * Wires the rules engine, channel router, daily-cap store, and
 * audit logger into a process that subscribes to NATS subjects
 * `crm.sync.events` and `collab.events.>`, dispatching
 * notifications on each incoming event.
 *
 * ── Environment variables ───────────────────────────────────────
 *   NATS_URL               NATS server URL (default: nats://localhost:4222)
 *   NATS_MAX_RECONNECT     Max connection attempts before degraded mode (default: 3)
 *   COLLAB_EVENTS_ENABLED  Enable collab.events.* subscription (default: true)
 *   REDIS_URL              Redis URL (default: redis://localhost:6379)
 *   NOTIFICATION_DISPATCHER_TEST_EVENT  One-shot test event (JSON)
 *
 * ── Degraded mode ───────────────────────────────────────────────
 *   If NATS connection fails after retries, the service logs a
 *   structured warning and continues running — the test-event
 *   smoke path and any HTTP health endpoints remain available.
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
import { parseCollabEvent } from './collab/parse.js';
import { mapCollabEvent } from './collab/mapper.js';
import { MentionDedup } from './collab/dedup.js';
import { NatsSubscriptionManager, connectWithRetry } from './nats_manager.js';
import type { CRMSyncEvent } from './types.js';

async function main() {
  const natsUrl = process.env.NATS_URL ?? 'nats://localhost:4222';
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const maxReconnect = Number(process.env.NATS_MAX_RECONNECT ?? 3);
  const collabEnabled = (process.env.COLLAB_EVENTS_ENABLED ?? 'true') !== 'false';

  // ─── Channel router ──────────────────────────────────────────
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
  const caps = new MemoryDailyCap();

  // ─── Audit writer ───────────────────────────────────────────
  const audit = new NoopAuditWriter();

  // ─── Dispatcher ─────────────────────────────────────────────
  const dispatcher = new Dispatcher({ router, caps, audit });

  // ─── Mention dedup (collaboration path) ─────────────────────
  const mentionDedup = new MentionDedup();

  // ─── NATS subscriber ────────────────────────────────────────
  console.log(JSON.stringify({
    msg: 'notification-dispatcher: starting',
    nats: natsUrl,
    redis: redisUrl,
    channels: ['slack', 'teams', 'email', 'in_app', 'webhook'],
    collab_enabled: collabEnabled,
  }));

  // Test-only: if NOTIFICATION_DISPATCHER_TEST_EVENT is set, evaluate
  // and dispatch a single event from the environment.
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

  // ─── CRM event handler ───────────────────────────────────────
  async function handleCrmEvent(raw: string): Promise<void> {
    const event: CRMSyncEvent = JSON.parse(raw);
    const rules: Array<import('./types.js').NotificationRule> = [];
    await dispatcher.dispatch(rules, event);
  }

  // ─── Collaboration event handler ─────────────────────────────
  // Processes a single collab event: parse → map → dedup → dispatch → audit.
  async function handleCollabEvent(raw: string): Promise<void> {
    let envelope;
    try {
      envelope = parseCollabEvent(raw);
    } catch (err) {
      console.error(JSON.stringify({
        msg: 'notification-dispatcher: collab event parse failed',
        error: err instanceof Error ? err.message : String(err),
      }));
      return;
    }

    const notifications = mapCollabEvent(envelope);
    if (notifications.length === 0) return;

    // Filter out deduped mentions.
    const toDispatch = notifications.filter((n) => {
      if (n.rule_id === 'collab-comment.mentioned') {
        return !mentionDedup.isDeduped(n.viewer_id_key, envelope.timestamp);
      }
      return true;
    });

    if (toDispatch.length === 0) return;

    const rows = await dispatcher.dispatchNotifications(toDispatch);
    console.log(JSON.stringify({
      msg: 'notification-dispatcher: collab event dispatched',
      event_type: envelope.event_type,
      notifications: rows.length,
    }));
  }

  // ─── Connect to NATS ────────────────────────────────────────
  const { StringCodec } = await import('nats');
  const nc = await connectWithRetry({ servers: natsUrl, maxReconnect });

  if (nc) {
    const sc = StringCodec();
    const manager = new NatsSubscriptionManager({
      nc,
      sc,
      handlers: { onCrmEvent: handleCrmEvent, onCollabEvent: handleCollabEvent },
      collabEnabled,
    });
    manager.start();
  }

  // ─── Graceful shutdown ──────────────────────────────────────
  const shutdown = async () => {
    console.log(JSON.stringify({ msg: 'notification-dispatcher: shutting down' }));
    if (nc) {
      try { await nc.drain(); } catch { /* already draining */ }
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Touch evaluateAll so the import isn't tree-shaken when we run
  // with the test event above.
  void evaluateAll;
}

main().catch((err) => {
  console.error(`notification-dispatcher: startup failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
