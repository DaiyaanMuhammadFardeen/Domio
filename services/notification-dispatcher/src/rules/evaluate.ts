/**
 * Notification dispatcher — rules engine.
 *
 * Given a workspace's notification rules + a CRM sync event, produce
 * 0..N notifications. The engine is pure (no I/O) so it's trivially
 * unit-testable; the dispatcher wires the engine up to the channel
 * senders + Redis caps + audit logger.
 *
 * Each rule produces at most one notification. The same rule firing
 * twice on the same CRM sync event is suppressed at the engine layer
 * (it isn't a list of matching rules).
 */

import type { CRMSyncEvent, Notification, NotificationPayload, NotificationRule, RuleCondition } from '../types.js';

/** RenderPayload turns the CRM sync event into a human-friendly payload. */
export function renderPayload(event: CRMSyncEvent): NotificationPayload {
  const lines: string[] = [];
  lines.push(`Event: ${event.event_name}`);
  lines.push(`Viewer: ${event.viewer_id_key}`);
  if (event.engagement_score !== undefined) {
    lines.push(`Engagement score: ${event.engagement_score}`);
  }
  if (event.dwell_ms !== undefined) {
    lines.push(`Dwell: ${event.dwell_ms} ms`);
  }
  if (event.completion_rate !== undefined) {
    lines.push(`Completion: ${(event.completion_rate * 100).toFixed(1)}%`);
  }
  return {
    title: `CRM event: ${event.event_name}`,
    body: lines.join('\n'),
  };
}

/**
 * Evaluate a single rule against the event. Returns the
 * notification if the rule fires, null otherwise.
 */
export function evaluateRule(rule: NotificationRule, event: CRMSyncEvent): Notification | null {
  if (!rule.enabled) return null;
  if (!matches(rule.condition, event)) return null;
  return {
    rule_id: rule.rule_id,
    workspace_id: rule.workspace_id,
    viewer_id_key: event.viewer_id_key,
    channel: rule.channel,
    recipient: resolveRecipient(rule),
    payload: renderPayload(event),
  };
}

/**
 * Evaluate all rules for an event and return the firing set.
 * Determinism: rules are evaluated in input order so callers can
 * rely on a stable ordering for tests + audit logs.
 */
export function evaluateAll(rules: NotificationRule[], event: CRMSyncEvent): Notification[] {
  const out: Notification[] = [];
  for (const r of rules) {
    const n = evaluateRule(r, event);
    if (n) out.push(n);
  }
  return out;
}

/** matches is the condition evaluator. */
export function matches(cond: RuleCondition, event: CRMSyncEvent): boolean {
  switch (cond.kind) {
    case 'always':
      return true;
    case 'event_name':
      return event.event_name === cond.equals;
    case 'lead_score': {
      const v = readNumeric(event, cond.source);
      if (v === undefined) return false;
      return v >= cond.gte;
    }
  }
}

function readNumeric(event: CRMSyncEvent, source: 'engagement_score' | 'dwell_ms' | 'completion_rate'): number | undefined {
  switch (source) {
    case 'engagement_score':
      return event.engagement_score;
    case 'dwell_ms':
      return event.dwell_ms;
    case 'completion_rate':
      return event.completion_rate;
  }
}

/**
 * resolveRecipient extracts the channel-specific recipient
 * identifier from the rule's target JSON.
 *
 *   slack   → target.channel_id  (e.g. "#sales-mqls")
 *   teams   → target.webhook_url (the Teams webhook URL itself)
 *   email   → target.email
 *   webhook → target.url
 *   in_app  → target.user_id     (the domio user)
 *   mobile  → target.device_token
 */
export function resolveRecipient(rule: NotificationRule): string {
  switch (rule.channel) {
    case 'slack':
      return rule.target.channel_id ?? '';
    case 'teams':
      return rule.target.webhook_url ?? '';
    case 'email':
      return rule.target.email ?? '';
    case 'webhook':
      return rule.target.url ?? '';
    case 'in_app':
      return rule.target.user_id ?? '';
    case 'mobile':
      return rule.target.device_token ?? '';
  }
}
