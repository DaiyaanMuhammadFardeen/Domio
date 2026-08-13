/**
 * Notification dispatcher — shared types.
 *
 * Mirrors the Postgres notification_rule + notification_audit
 * tables defined in 0061_analytics_crm.up.sql.
 */

/** Channel the dispatcher routes to. */
export type ChannelKind = 'slack' | 'teams' | 'email' | 'webhook' | 'mobile' | 'in_app';

/**
 * NotificationRule is the in-memory shape the dispatcher reads from
 * Postgres. The `condition` is a small JSON expression evaluated
 * against the CRM sync event; see ./rules/evaluate.ts for the
 * supported operators.
 */
export interface NotificationRule {
  rule_id: string;
  workspace_id: string;
  name: string;
  enabled: boolean;
  channel: ChannelKind;
  target: Record<string, string>;
  daily_cap: number;
  condition: RuleCondition;
}

/**
 * RuleCondition is the JSONB blob on notification_rule.condition_json.
 * For v1 we support two shapes:
 *
 *   { kind: 'lead_score', gte: 80, source: 'engagement_score' }
 *   { kind: 'event_name', equals: 'interaction' }
 *   { kind: 'always' }
 */
export type RuleCondition =
  | { kind: 'always' }
  | { kind: 'event_name'; equals: string }
  | {
      kind: 'lead_score';
      gte: number;
      source: 'engagement_score' | 'dwell_ms' | 'completion_rate';
    };

/** CRMSyncEvent is the input the rules engine evaluates. */
export interface CRMSyncEvent {
  workspace_id: string;
  connection_id: string;
  viewer_id_key: string;
  event_id: string;
  event_name: string;
  idempotency_key: string;
  /** Numeric score the rule may inspect (engagement_score, dwell_ms, etc.). */
  engagement_score?: number;
  dwell_ms?: number;
  completion_rate?: number;
  properties?: Record<string, string>;
}

/** Notification is what the rules engine emits. */
export interface Notification {
  rule_id: string;
  workspace_id: string;
  viewer_id_key: string;
  channel: ChannelKind;
  recipient: string;
  payload: NotificationPayload;
}

/** NotificationPayload is the rendered message body the channel sends. */
export interface NotificationPayload {
  title: string;
  body: string;
  link?: string;
  fields?: Record<string, string>;
}

/** AuditEntry is the row written to notification_audit. */
export interface AuditEntry {
  workspace_id: string;
  rule_id: string;
  viewer_id_key: string | null;
  channel: ChannelKind;
  recipient: string;
  payload_hash: string;
  state: 'sent' | 'suppressed' | 'failed';
  error_message?: string;
}
