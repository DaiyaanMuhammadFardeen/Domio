'use client';

import { useState, type FormEvent } from 'react';
import {
  createScheduledReport,
  type CreateScheduledReportInput,
  type ScheduleChannel,
  type ScheduleFormat,
  type ScheduleFrequency,
} from '../lib/export-service';

export interface ScheduledReportFormProps {
  workspaceId: string;
  onCreate?: (input: CreateScheduledReportInput) => Promise<void> | void;
}

const FREQUENCIES: ReadonlyArray<ScheduleFrequency> = ['daily', 'weekly', 'monthly'];
const CHANNELS: ReadonlyArray<ScheduleChannel> = ['email', 'slack'];
const FORMATS: ReadonlyArray<ScheduleFormat> = ['csv', 'pdf', 'parquet'];

interface FieldErrors {
  name?: string;
  frequency?: string;
  format?: string;
  channel?: string;
  target?: string;
}

/**
 * ScheduledReportForm — schedule a recurring email / Slack dashboard
 * export as PDF / CSV / Parquet.
 *
 * Validates the form locally then delegates to
 * `createScheduledReport` on the export-svc.
 */
export function ScheduledReportForm({ workspaceId, onCreate }: ScheduledReportFormProps) {
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState<ScheduleFrequency>('weekly');
  const [format, setFormat] = useState<ScheduleFormat>('pdf');
  const [channel, setChannel] = useState<ScheduleChannel>('email');
  const [target, setTarget] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<number | null>(null);

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (name.trim().length === 0) next.name = 'Name is required';
    if (!FREQUENCIES.includes(frequency)) next.frequency = 'Pick a frequency';
    if (!FORMATS.includes(format)) next.format = 'Pick a format';
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
      const input: CreateScheduledReportInput = {
        name: name.trim(),
        frequency,
        format,
        channel,
        target: target.trim(),
      };
      if (onCreate) {
        await onCreate(input);
      } else {
        await createScheduledReport(workspaceId, input);
      }
      setSubmittedAt(Date.now());
      setName('');
      setTarget('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="scheduled-report-form"
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-4"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
        Schedule a recurring export
      </h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
            Report name
          </span>
          <input
            data-testid="schedule-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Weekly QBR pack"
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          {errors.name ? (
            <span className="mt-1 block text-xs text-rose-600">{errors.name}</span>
          ) : null}
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
            Frequency
          </span>
          <select
            data-testid="schedule-frequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as ScheduleFrequency)}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          {errors.frequency ? (
            <span className="mt-1 block text-xs text-rose-600">{errors.frequency}</span>
          ) : null}
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
            Format
          </span>
          <select
            data-testid="schedule-format"
            value={format}
            onChange={(e) => setFormat(e.target.value as ScheduleFormat)}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {f.toUpperCase()}
              </option>
            ))}
          </select>
          {errors.format ? (
            <span className="mt-1 block text-xs text-rose-600">{errors.format}</span>
          ) : null}
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
            Channel
          </span>
          <select
            data-testid="schedule-channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value as ScheduleChannel)}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {errors.channel ? (
            <span className="mt-1 block text-xs text-rose-600">{errors.channel}</span>
          ) : null}
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
            Target (email or #slack-channel)
          </span>
          <input
            data-testid="schedule-target"
            type="text"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="analytics@example.com or #dashboard"
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
          data-testid="schedule-save"
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save schedule'}
        </button>
        {submittedAt ? (
          <span
            data-testid="schedule-saved"
            className="text-xs font-medium text-emerald-700"
          >
            Scheduled at {new Date(submittedAt).toLocaleTimeString()}
          </span>
        ) : null}
      </div>
    </form>
  );
}