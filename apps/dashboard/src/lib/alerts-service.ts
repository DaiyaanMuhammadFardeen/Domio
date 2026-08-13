/**
 * alerts-service — typed client for the real-time alerts surface.
 *
 * Per Wave 7 §S7.6 of docs/frontend-roadmap/07-wave-analytics-insights.md.
 *
 * Wraps `/v1/alerts` on the alerting/notification-dispatcher service.
 * The dashboard reads existing alert rules, queues new ones, and
 * subscribes to the triggered-alert feed. Any failure from the
 * upstream is surfaced as an empty list — the page renders an empty
 * state, never fabricated alerts.
 */

import { fetcher } from './fetcher';

export type AlertMetric =
  | 'completion_rate'
  | 'avg_dwell_ms'
  | 'bounce_rate'
  | 'live_attendance'
  | 'dlq_depth';

export type AlertChannel = 'slack' | 'teams' | 'email' | 'webhook';

export type AlertComparator = 'above' | 'below';

export interface AlertRule {
  readonly id: string;
  readonly workspaceId: string;
  readonly metric: AlertMetric;
  readonly comparator: AlertComparator;
  readonly threshold: number;
  readonly channel: AlertChannel;
  readonly target: string;
  readonly createdAtMs: number;
}

export interface AlertEvent {
  readonly id: string;
  readonly ruleId: string;
  readonly metric: AlertMetric;
  readonly observedValue: number;
  readonly threshold: number;
  readonly triggeredAtMs: number;
  readonly summary: string;
  readonly href?: string;
}

interface AlertRuleWire {
  id?: string;
  workspace_id?: string;
  metric?: string;
  comparator?: string;
  threshold?: number;
  channel?: string;
  target?: string;
  created_at_ms?: number;
}

interface AlertEventWire {
  id?: string;
  rule_id?: string;
  metric?: string;
  observed_value?: number;
  threshold?: number;
  triggered_at_ms?: number;
  summary?: string;
  href?: string;
}

const DEFAULT_BASE: string =
  (typeof process !== 'undefined' ? process.env['NOTIFICATION_DISPATCHER_URL'] : undefined) ??
  'http://localhost:8097';

const VALID_METRICS: ReadonlyArray<AlertMetric> = [
  'completion_rate',
  'avg_dwell_ms',
  'bounce_rate',
  'live_attendance',
  'dlq_depth',
];

const VALID_CHANNELS: ReadonlyArray<AlertChannel> = ['slack', 'teams', 'email', 'webhook'];

const VALID_COMPARATORS: ReadonlyArray<AlertComparator> = ['above', 'below'];

function asMetric(value: string | undefined): AlertMetric {
  return (VALID_METRICS as readonly string[]).includes(value ?? '')
    ? (value as AlertMetric)
    : 'completion_rate';
}

function asChannel(value: string | undefined): AlertChannel {
  return (VALID_CHANNELS as readonly string[]).includes(value ?? '')
    ? (value as AlertChannel)
    : 'email';
}

function asComparator(value: string | undefined): AlertComparator {
  return (VALID_COMPARATORS as readonly string[]).includes(value ?? '')
    ? (value as AlertComparator)
    : 'above';
}

function ruleFromWire(wire: AlertRuleWire): AlertRule {
  return {
    id: wire.id ?? '',
    workspaceId: wire.workspace_id ?? '',
    metric: asMetric(wire.metric),
    comparator: asComparator(wire.comparator),
    threshold: Number(wire.threshold ?? 0),
    channel: asChannel(wire.channel),
    target: wire.target ?? '',
    createdAtMs: Number(wire.created_at_ms ?? Date.now()),
  };
}

function eventFromWire(wire: AlertEventWire): AlertEvent {
  return {
    id: wire.id ?? '',
    ruleId: wire.rule_id ?? '',
    metric: asMetric(wire.metric),
    observedValue: Number(wire.observed_value ?? 0),
    threshold: Number(wire.threshold ?? 0),
    triggeredAtMs: Number(wire.triggered_at_ms ?? Date.now()),
    summary: wire.summary ?? '',
    ...(wire.href ? { href: wire.href } : {}),
  };
}

export interface CreateAlertRuleInput {
  readonly metric: AlertMetric;
  readonly comparator: AlertComparator;
  readonly threshold: number;
  readonly channel: AlertChannel;
  readonly target: string;
}

/**
 * Fetch existing alert rules for a workspace.
 *
 * Returns an empty list on any failure — the page renders an empty
 * state. We never fabricate rules.
 */
export async function listAlertRules(
  workspaceId: string,
  baseUrl: string = DEFAULT_BASE,
): Promise<ReadonlyArray<AlertRule>> {
  try {
    const json = await fetcher<{ rules?: AlertRuleWire[] }>(baseUrl, '/v1/alerts/rules', {
      workspaceId,
    });
    return (json.rules ?? []).map(ruleFromWire);
  } catch {
    return [];
  }
}

/**
 * Create a new alert rule. The dispatcher service is responsible for
 * pushing the resulting alert via the chosen channel.
 */
export async function createAlertRule(
  workspaceId: string,
  input: CreateAlertRuleInput,
  baseUrl: string = DEFAULT_BASE,
): Promise<AlertRule> {
  const json = await fetcher<AlertRuleWire>(baseUrl, '/v1/alerts/rules', {
    method: 'POST',
    workspaceId,
    body: {
      workspace_id: workspaceId,
      metric: input.metric,
      comparator: input.comparator,
      threshold: input.threshold,
      channel: input.channel,
      target: input.target,
    },
  });
  return ruleFromWire(json);
}

/**
 * Fetch the most recent triggered alerts (the live feed).
 *
 * Returns an empty list on any failure.
 */
export async function listTriggeredAlerts(
  workspaceId: string,
  baseUrl: string = DEFAULT_BASE,
  limit: number = 25,
): Promise<ReadonlyArray<AlertEvent>> {
  try {
    const json = await fetcher<{ events?: AlertEventWire[] }>(baseUrl, '/v1/alerts/events', {
      workspaceId,
    });
    const all = (json.events ?? []).map(eventFromWire);
    return all.slice(0, limit);
  } catch {
    return [];
  }
}

export const ALERT_METRIC_LABELS: Readonly<Record<AlertMetric, string>> = {
  completion_rate: 'Completion rate',
  avg_dwell_ms: 'Average dwell (ms)',
  bounce_rate: 'Bounce rate',
  live_attendance: 'Live attendance',
  dlq_depth: 'DLQ depth',
};

export const ALERT_CHANNEL_LABELS: Readonly<Record<AlertChannel, string>> = {
  slack: 'Slack',
  teams: 'Microsoft Teams',
  email: 'Email',
  webhook: 'Generic webhook',
};
