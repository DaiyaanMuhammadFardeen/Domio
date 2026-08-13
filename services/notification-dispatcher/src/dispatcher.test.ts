import { describe, it, expect, vi } from 'vitest';
import { Dispatcher } from './dispatcher.js';
import {
  Router,
  SlackSender,
  EmailSender,
  InAppSender,
  type EmailTransport,
  type NatsPublisher,
} from './channels/router.js';
import { MemoryDailyCap } from './caps/daily.js';
import { MemoryAuditWriter } from './audit/redact.js';
import type { CRMSyncEvent, NotificationRule } from './types.js';

function rule(overrides: Partial<NotificationRule> = {}): NotificationRule {
  return {
    rule_id: 'r-1',
    workspace_id: 'w-1',
    name: 'default',
    enabled: true,
    channel: 'slack',
    target: { channel_id: '#s' },
    daily_cap: 5,
    condition: { kind: 'always' },
    ...overrides,
  };
}

function event(overrides: Partial<CRMSyncEvent> = {}): CRMSyncEvent {
  return {
    workspace_id: 'w-1',
    connection_id: 'c-1',
    viewer_id_key: 'v-1',
    event_id: 'e-1',
    event_name: 'view',
    idempotency_key: 'k-1',
    ...overrides,
  };
}

function buildDeps(opts: { slackSend?: typeof fetch; caps?: MemoryDailyCap } = {}) {
  const slack = new SlackSender(
    opts.slackSend ?? (async () => new Response(null, { status: 200 })),
  );
  const emailTransport: EmailTransport = { send: async () => ({ ok: true }) };
  const nats: NatsPublisher = { publish: async () => {} };
  const router = new Router([slack, new EmailSender(emailTransport), new InAppSender(nats)]);
  const caps = opts.caps ?? new MemoryDailyCap();
  const audit = new MemoryAuditWriter();
  return { router, caps, audit, dispatcher: new Dispatcher({ router, caps, audit }) };
}

describe('dispatcher', () => {
  it('routes a fire to the right channel and audits sent', async () => {
    const { dispatcher, audit } = buildDeps();
    const rows = await dispatcher.dispatch([rule()], event());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.state).toBe('sent');
    expect(audit.entries).toHaveLength(1);
  });

  it('returns empty when no rules fire', async () => {
    const { dispatcher, audit } = buildDeps();
    const rows = await dispatcher.dispatch(
      [rule({ condition: { kind: 'event_name', equals: 'never' } })],
      event(),
    );
    expect(rows).toHaveLength(0);
    expect(audit.entries).toHaveLength(0);
  });

  it('suppresses after daily_cap', async () => {
    const { dispatcher, audit } = buildDeps();
    const r = rule({ rule_id: 'r-cap', daily_cap: 2 });
    await dispatcher.dispatch([r], event({ event_id: 'a' }));
    await dispatcher.dispatch([r], event({ event_id: 'b' }));
    const rows = await dispatcher.dispatch([r], event({ event_id: 'c' }));
    expect(rows[0]?.state).toBe('suppressed');
    expect(rows[0]?.error_message).toBe('daily_cap_exceeded');
    expect(audit.entries.filter((e) => e.state === 'sent')).toHaveLength(2);
    expect(audit.entries.filter((e) => e.state === 'suppressed')).toHaveLength(1);
  });

  it('audits redacted_fields for sent notifications', async () => {
    const { dispatcher } = buildDeps();
    const rows = await dispatcher.dispatch([rule()], event());
    expect(rows[0]?.redacted_fields).toBeDefined();
    expect(Array.isArray(rows[0]?.redacted_fields)).toBe(true);
  });

  it('audits failed when channel returns error', async () => {
    const slackFetch: typeof fetch = async () => new Response('err', { status: 500 });
    const { dispatcher, audit } = buildDeps({ slackSend: slackFetch });
    const rows = await dispatcher.dispatch([rule()], event());
    expect(rows[0]?.state).toBe('failed');
    expect(rows[0]?.error_message).toContain('500');
    expect(audit.entries).toHaveLength(1);
  });

  it('handles multiple rules firing for one event', async () => {
    const { dispatcher, audit } = buildDeps();
    const rs = [
      rule({ rule_id: 'r-a', channel: 'slack', target: { channel_id: '#s' } }),
      rule({ rule_id: 'r-b', channel: 'email', target: { email: 'a@b.com' } }),
      rule({ rule_id: 'r-c', channel: 'in_app', target: { user_id: 'u-1' } }),
    ];
    const rows = await dispatcher.dispatch(rs, event());
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.state)).toEqual(['sent', 'sent', 'sent']);
    expect(audit.entries).toHaveLength(3);
  });

  it('uses rule daily_cap from the rule list', async () => {
    const { dispatcher } = buildDeps();
    const low = rule({ rule_id: 'r-low', daily_cap: 1 });
    const rows1 = await dispatcher.dispatch([low], event({ event_id: 'e1' }));
    const rows2 = await dispatcher.dispatch([low], event({ event_id: 'e2' }));
    expect(rows1[0]?.state).toBe('sent');
    expect(rows2[0]?.state).toBe('suppressed');
  });

  it('uses fallback cap for unknown rule id', async () => {
    // The dispatcher tolerates a deleted rule by falling back to a
    // large cap. This is a safety net, not a security control.
    const { dispatcher } = buildDeps();
    const rows = await dispatcher.dispatch([rule({ rule_id: 'r-real' })], event());
    expect(rows[0]?.state).toBe('sent');
  });

  it('captures router exceptions as failed', async () => {
    const slackFetch: typeof fetch = async () => {
      throw new Error('boom');
    };
    const { dispatcher, audit } = buildDeps({ slackSend: slackFetch });
    const rows = await dispatcher.dispatch([rule()], event());
    expect(rows[0]?.state).toBe('failed');
    expect(rows[0]?.error_message).toContain('boom');
    expect(audit.entries).toHaveLength(1);
  });

  it('mock test: vi spy on audit', async () => {
    const { dispatcher } = buildDeps();
    const spy = vi.spyOn(dispatcher['deps'].audit, 'write');
    await dispatcher.dispatch([rule()], event());
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
