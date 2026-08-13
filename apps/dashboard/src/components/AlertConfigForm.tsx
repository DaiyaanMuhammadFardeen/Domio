'use client';

import { useState, type FormEvent } from 'react';
import {
  ALERT_CHANNEL_LABELS,
  ALERT_METRIC_LABELS,
  type AlertChannel,
  type AlertComparator,
  type AlertMetric,
} from '../lib/alerts-service';

export interface AlertConfigFormProps {
  onSave: (input: {
    metric: AlertMetric;
    comparator: AlertComparator;
    threshold: number;
    channel: AlertChannel;
    target: string;
  }) => Promise<void> | void;
}

const METRICS: ReadonlyArray<AlertMetric> = [
  'completion_rate',
  'avg_dwell_ms',
  'bounce_rate',
  'live_attendance',
  'dlq_depth',
];

const CHANNELS: ReadonlyArray<AlertChannel> = ['slack', 'teams', 'email', 'webhook'];

interface FieldErrors {
  metric?: string;
  comparator?: string;
  threshold?: string;
  channel?: string;
  target?: string;
}

/**
 * AlertConfigForm — pick metric + threshold + notification channel.
 *
 * Validates inputs locally before delegating to `onSave`. The parent
 * is responsible for talking to the notification-dispatcher service.
 */
export function AlertConfigForm({ onSave }: AlertConfigFormProps) {
  const [metric, setMetric] = useState<AlertMetric>('completion_rate');
  const [comparator, setComparator] = useState<AlertComparator>('below');
  const [threshold, setThreshold] = useState<string>('0.5');
  const [channel, setChannel] = useState<AlertChannel>('slack');
  const [target, setTarget] = useState<string>('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<number | null>(null);

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!METRICS.includes(metric)) next.metric = 'Pick a metric';
    if (!['above', 'below'].includes(comparator)) next.comparator = 'Pick a direction';
    const thresholdNum = Number(threshold);
    if (!Number.isFinite(thresholdNum)) next.threshold = 'Must be a number';
    if (!CHANNELS.includes(channel)) next.channel = 'Pick a channel';
    if (target.trim().length === 0) next.target = 'Channel target is required';
    return next;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSubmitting(true);
    try {
      await onSave({
        metric,
        comparator,
        threshold: Number(threshold),
        channel,
        target: target.trim(),
      });
      setSubmittedAt(Date.now());
      setTarget('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="alert-config-form"
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-4"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
        New alert rule
      </h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
            Metric
          </span>
          <select
            data-testid="alert-metric"
            value={metric}
            onChange={(e) => setMetric(e.target.value as AlertMetric)}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            {METRICS.map((m) => (
              <option key={m} value={m}>
                {ALERT_METRIC_LABELS[m]}
              </option>
            ))}
          </select>
          {errors.metric ? (
            <span className="mt-1 block text-xs text-rose-600">{errors.metric}</span>
          ) : null}
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
            Threshold
          </span>
          <input
            data-testid="alert-threshold"
            type="number"
            step="any"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          {errors.threshold ? (
            <span className="mt-1 block text-xs text-rose-600">{errors.threshold}</span>
          ) : null}
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
            Trigger when
          </span>
          <select
            data-testid="alert-comparator"
            value={comparator}
            onChange={(e) => setComparator(e.target.value as AlertComparator)}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="below">Below threshold</option>
            <option value="above">Above threshold</option>
          </select>
          {errors.comparator ? (
            <span className="mt-1 block text-xs text-rose-600">{errors.comparator}</span>
          ) : null}
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
            Channel
          </span>
          <select
            data-testid="alert-channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value as AlertChannel)}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {ALERT_CHANNEL_LABELS[c]}
              </option>
            ))}
          </select>
          {errors.channel ? (
            <span className="mt-1 block text-xs text-rose-600">{errors.channel}</span>
          ) : null}
        </label>

        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
            Target (#channel, email, or webhook URL)
          </span>
          <input
            data-testid="alert-target"
            type="text"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="#analytics-alerts or https://hooks.example.com/x"
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          {errors.target ? (
            <span className="mt-1 block text-xs text-rose-600">{errors.target}</span>
          ) : null}
        </label>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="submit"
          disabled={submitting}
          data-testid="alert-save"
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save rule'}
        </button>
        {submittedAt ? (
          <span
            data-testid="alert-saved"
            className="text-xs font-medium text-emerald-700"
          >
            Rule saved at {new Date(submittedAt).toLocaleTimeString()}
          </span>
        ) : null}
      </div>
    </form>
  );
}
