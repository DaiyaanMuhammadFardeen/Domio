import { describe, it, expect } from 'vitest';
import {
  routeBySubscription,
  InMemorySubscriptionProvider,
  type NotificationSubscription,
} from './routing.js';
import type { Notification } from './types.js';

function notif(overrides: Partial<Notification> = {}): Notification {
  return {
    rule_id: 'collab-comment.mentioned',
    workspace_id: 'w-1',
    viewer_id_key: 'v-1',
    channel: 'slack',
    recipient: 'u-1',
    payload: { title: 'T', body: 'B', link: '/decks/d-1' },
    ...overrides,
  };
}

function sub(overrides: Partial<NotificationSubscription> = {}): NotificationSubscription {
  return {
    user_id: 'u-sub',
    resource_type: 'deck',
    resource_id: 'd-1',
    event_types: ['collab-comment.mentioned'],
    channels: ['slack', 'in_app'],
    digest_mode: false,
    ...overrides,
  };
}

describe('routing', () => {
  describe('routeBySubscription', () => {
    it('returns empty when no subscriptions match', () => {
      const deliveries = routeBySubscription(notif(), []);
      expect(deliveries).toHaveLength(0);
    });

    it('returns deliveries for matching event_types', () => {
      const deliveries = routeBySubscription(notif(), [sub()]);
      expect(deliveries).toHaveLength(2); // slack + in_app
      expect(deliveries[0]?.notification.channel).toBe('slack');
      expect(deliveries[0]?.notification.recipient).toBe('u-sub');
      expect(deliveries[1]?.notification.channel).toBe('in_app');
    });

    it('skips subscriptions with non-matching event_types', () => {
      const s = sub({ event_types: ['collab-approval.requested'] });
      const deliveries = routeBySubscription(notif(), [s]);
      expect(deliveries).toHaveLength(0);
    });

    it('applies quiet hours — deferred=true when in quiet window', () => {
      const s = sub({
        quiet_hours: { start: 22, end: 7, tz: 'UTC' },
        digest_mode: true,
      });
      // UTC 23:00 → quiet
      const now = new Date('2024-01-15T23:00:00Z').getTime();
      const deliveries = routeBySubscription(notif(), [s], {
        now,
        offsetMinutes: () => 0,
      });
      expect(deliveries).toHaveLength(2);
      expect(deliveries[0]?.deferred).toBe(true);
      expect(deliveries[1]?.deferred).toBe(true);
    });

    it('does not defer when outside quiet hours', () => {
      const s = sub({
        quiet_hours: { start: 22, end: 7, tz: 'UTC' },
        digest_mode: true,
      });
      // UTC 10:00 → not quiet
      const now = new Date('2024-01-15T10:00:00Z').getTime();
      const deliveries = routeBySubscription(notif(), [s], {
        now,
        offsetMinutes: () => 0,
      });
      expect(deliveries[0]?.deferred).toBe(false);
    });

    it('does not defer when digest_mode is false', () => {
      const s = sub({
        quiet_hours: { start: 22, end: 7, tz: 'UTC' },
        digest_mode: false,
      });
      const now = new Date('2024-01-15T23:00:00Z').getTime();
      const deliveries = routeBySubscription(notif(), [s], {
        now,
        offsetMinutes: () => 0,
      });
      expect(deliveries[0]?.deferred).toBe(false);
    });

    it('signs outbound payload when signer is provided', () => {
      const signer = { sign: (body: string) => `sig:${body.length}` };
      const deliveries = routeBySubscription(notif(), [sub()], { signer });
      expect(deliveries[0]?.notification.payload.fields?.['x-domio-signature']).toBeDefined();
      expect(deliveries[0]?.notification.payload.fields?.['x-domio-signature']).toContain('sig:');
    });

    it('multiple subscriptions produce multiple deliveries', () => {
      const s1 = sub({ user_id: 'u-1', channels: ['slack'] });
      const s2 = sub({ user_id: 'u-2', channels: ['teams'] });
      const deliveries = routeBySubscription(notif(), [s1, s2]);
      expect(deliveries).toHaveLength(2);
      expect(deliveries[0]?.notification.recipient).toBe('u-1');
      expect(deliveries[1]?.notification.recipient).toBe('u-2');
    });
  });

  describe('InMemorySubscriptionProvider', () => {
    it('returns matching subscriptions', async () => {
      const provider = new InMemorySubscriptionProvider();
      provider.add(sub({ resource_type: 'deck', resource_id: 'd-1', event_types: ['e1'] }));
      provider.add(sub({ resource_type: 'deck', resource_id: 'd-2', event_types: ['e1'] }));
      provider.add(sub({ resource_type: 'slide', resource_id: 'd-1', event_types: ['e1'] }));

      const results = await provider.getSubscriptions('deck', 'd-1', ['e1']);
      expect(results).toHaveLength(1);
      expect(results[0]?.resource_id).toBe('d-1');
    });

    it('returns empty for no matches', async () => {
      const provider = new InMemorySubscriptionProvider();
      provider.add(sub({ event_types: ['other'] }));

      const results = await provider.getSubscriptions('deck', 'd-1', ['collab-comment.mentioned']);
      expect(results).toHaveLength(0);
    });
  });
});
