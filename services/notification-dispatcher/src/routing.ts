/**
 * Notification dispatcher — subscription-based routing.
 *
 * Resolves which users should receive a notification based on
 * notification_subscription rows. Each subscription specifies:
 *   - Which resource types + IDs the user watches.
 *   - Which event types trigger notifications.
 *   - Which channels deliver the notification.
 *   - Per-subscription quiet-hours and digest mode.
 *
 * The routing layer sits between the mapper and the channel
 * router: it expands a single Notification into N deliveries
 * (one per matching subscriber × channel), filtering out
 * subscribers in quiet-hours mode (deferred to digest).
 */

import type { ChannelKind, Notification } from './types.js';
import { isQuietHour, type QuietHours } from './quiet_hours.js';

// ─── Types ──────────────────────────────────────────────────────

export interface NotificationSubscription {
  user_id: string;
  resource_type: string;
  resource_id: string;
  event_types: string[];
  channels: ChannelKind[];
  quiet_hours?: QuietHours | undefined;
  digest_mode: boolean;
}

export interface ResolvedDelivery {
  notification: Notification;
  /** true if this delivery is deferred to digest (quiet hours active). */
  deferred: boolean;
}

// ─── Provider ───────────────────────────────────────────────────

export interface SubscriptionProvider {
  getSubscriptions(
    resourceType: string,
    resourceId: string,
    eventTypes: string[],
  ): Promise<NotificationSubscription[]>;
}

/** InMemorySubscriptionProvider for tests. */
export class InMemorySubscriptionProvider implements SubscriptionProvider {
  private readonly subs: NotificationSubscription[] = [];

  add(sub: NotificationSubscription): void {
    this.subs.push(sub);
  }

  async getSubscriptions(
    resourceType: string,
    resourceId: string,
    eventTypes: string[],
  ): Promise<NotificationSubscription[]> {
    return this.subs.filter((s) => {
      if (s.resource_type !== resourceType) return false;
      if (s.resource_id !== resourceId) return false;
      return s.event_types.some((et) => eventTypes.includes(et));
    });
  }
}

// ─── Routing ────────────────────────────────────────────────────

/**
 * routeBySubscription resolves recipients from subscription rows
 * and produces a list of ResolvedDelivery objects.
 *
 * For each subscription whose event_types match the notification's
 * rule_id (used as the event type proxy), one delivery per
 * channel is produced. Subscribers in quiet-hours mode get
 * `deferred: true`.
 *
 * @param notification   The base notification from the mapper.
 * @param subscriptions  Matching subscriptions from the provider.
 * @param opts           Optional overrides for testing.
 */
export function routeBySubscription(
  notification: Notification,
  subscriptions: NotificationSubscription[],
  opts?: {
    now?: number | undefined;
    offsetMinutes?: (now: Date, tz: string) => number;
    signer?: { sign: (body: string) => string } | undefined;
  },
): ResolvedDelivery[] {
  const now = opts?.now ?? Date.now();
  const deliveries: ResolvedDelivery[] = [];

  for (const sub of subscriptions) {
    // Check if this subscription's event types include the notification's rule.
    if (!sub.event_types.includes(notification.rule_id)) continue;

    // Route to each channel the subscriber configured.
    for (const channel of sub.channels) {
      const n: Notification = {
        ...notification,
        channel,
        recipient: sub.user_id,
      };

      // Sign the outbound payload if a signer is provided.
      if (opts?.signer) {
        const body = JSON.stringify({
          rule_id: n.rule_id,
          workspace_id: n.workspace_id,
          title: n.payload.title,
          body: n.payload.body,
          link: n.payload.link,
        });
        const signature = opts.signer.sign(body);
        // Attach signature as a field so the sender can include it.
        n.payload = {
          ...n.payload,
          fields: { ...n.payload.fields, 'x-domio-signature': signature },
        };
      }

      // Check quiet hours.
      let deferred = false;
      if (sub.quiet_hours && sub.digest_mode) {
        deferred = isQuietHour(
          sub.quiet_hours,
          now,
          opts?.offsetMinutes ? { offsetMinutes: opts.offsetMinutes } : undefined,
        );
      }

      deliveries.push({ notification: n, deferred });
    }
  }

  return deliveries;
}
