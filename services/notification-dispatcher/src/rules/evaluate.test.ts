import { describe, it, expect } from 'vitest';
import { evaluateRule, evaluateAll, matches, renderPayload, resolveRecipient } from './evaluate.js';
import type { CRMSyncEvent, NotificationRule } from '../types.js';

function rule(overrides: Partial<NotificationRule> = {}): NotificationRule {
  return {
    rule_id: 'r-1',
    workspace_id: 'w-1',
    name: 'default',
    enabled: true,
    channel: 'slack',
    target: { channel_id: '#sales' },
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

describe('rules/evaluate', () => {
  it('always condition fires', () => {
    expect(matches({ kind: 'always' }, event())).toBe(true);
  });

  it('event_name condition matches exactly', () => {
    expect(matches({ kind: 'event_name', equals: 'view' }, event({ event_name: 'view' }))).toBe(true);
    expect(matches({ kind: 'event_name', equals: 'view' }, event({ event_name: 'interaction' }))).toBe(false);
  });

  it('lead_score condition returns false when source absent', () => {
    expect(matches({ kind: 'lead_score', gte: 80, source: 'engagement_score' }, event())).toBe(false);
  });

  it('lead_score condition returns true when source >= gte', () => {
    expect(matches({ kind: 'lead_score', gte: 80, source: 'engagement_score' }, event({ engagement_score: 90 }))).toBe(true);
    expect(matches({ kind: 'lead_score', gte: 80, source: 'engagement_score' }, event({ engagement_score: 80 }))).toBe(true);
    expect(matches({ kind: 'lead_score', gte: 80, source: 'engagement_score' }, event({ engagement_score: 79 }))).toBe(false);
  });

  it('disabled rule never fires', () => {
    const r = rule({ enabled: false });
    expect(evaluateRule(r, event())).toBeNull();
  });

  it('evaluateRule returns notification when condition matches', () => {
    const r = rule({ rule_id: 'r-2', channel: 'email', target: { email: 'sales@example.com' } });
    const n = evaluateRule(r, event({ viewer_id_key: 'v-2' }));
    expect(n).not.toBeNull();
    expect(n?.rule_id).toBe('r-2');
    expect(n?.recipient).toBe('sales@example.com');
    expect(n?.viewer_id_key).toBe('v-2');
  });

  it('evaluateAll returns deterministic order', () => {
    const rs = [
      rule({ rule_id: 'a' }),
      rule({ rule_id: 'b', condition: { kind: 'event_name', equals: 'nope' } }),
      rule({ rule_id: 'c' }),
    ];
    const out = evaluateAll(rs, event());
    expect(out.map((n) => n.rule_id)).toEqual(['a', 'c']);
  });

  it('renderPayload composes a body', () => {
    const p = renderPayload(event({ engagement_score: 90, dwell_ms: 12000 }));
    expect(p.title).toContain('view');
    expect(p.body).toContain('Engagement score: 90');
    expect(p.body).toContain('Dwell: 12000 ms');
  });

  it('resolveRecipient handles all channels', () => {
    expect(resolveRecipient(rule({ channel: 'slack', target: { channel_id: '#s' } }))).toBe('#s');
    expect(resolveRecipient(rule({ channel: 'teams', target: { webhook_url: 'https://teams.webhook' } }))).toBe('https://teams.webhook');
    expect(resolveRecipient(rule({ channel: 'email', target: { email: 'a@b.com' } }))).toBe('a@b.com');
    expect(resolveRecipient(rule({ channel: 'webhook', target: { url: 'https://x' } }))).toBe('https://x');
    expect(resolveRecipient(rule({ channel: 'in_app', target: { user_id: 'u-1' } }))).toBe('u-1');
    expect(resolveRecipient(rule({ channel: 'mobile', target: { device_token: 'tok' } }))).toBe('tok');
  });
});
