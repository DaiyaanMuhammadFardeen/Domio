/**
 * Dashboard export service — CSV / PDF export jobs.
 *
 * Per Wave 7 §S7.1 of docs/frontend-roadmap/07-wave-analytics-insights.md.
 *
 * Wraps the export service's job endpoints:
 *   POST /v1/exports/jobs   — queue a new export
 *   GET  /v1/exports/jobs/{id} — poll job status
 *
 * On any failure the loader returns an empty list / null. The page
 * renders an empty state — never fabricated URLs.
 */

import { fetcher } from './fetcher';

export type DashboardExportFormat = 'csv' | 'pdf';

export interface DashboardExportJob {
  readonly id: string;
  readonly workspaceId: string;
  readonly format: DashboardExportFormat;
  readonly status: 'queued' | 'running' | 'done' | 'failed';
  readonly downloadUrl?: string;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
}

interface ExportJobWire {
  id?: string;
  workspace_id?: string;
  format?: string;
  status?: string;
  download_url?: string;
  created_at_ms?: number;
  updated_at_ms?: number;
}

function asFormat(value: string | undefined): DashboardExportFormat {
  return value === 'csv' || value === 'pdf' ? value : 'csv';
}

function asStatus(value: string | undefined): DashboardExportJob['status'] {
  if (value === 'queued' || value === 'running' || value === 'done' || value === 'failed') {
    return value;
  }
  return 'queued';
}

function mapJob(raw: ExportJobWire): DashboardExportJob {
  const now = Date.now();
  return {
    id: String(raw.id ?? ''),
    workspaceId: String(raw.workspace_id ?? ''),
    format: asFormat(raw.format),
    status: asStatus(raw.status),
    ...(raw.download_url ? { downloadUrl: String(raw.download_url) } : {}),
    createdAtMs: Number(raw.created_at_ms ?? now),
    updatedAtMs: Number(raw.updated_at_ms ?? now),
  };
}

const DEFAULT_BASE: string =
  (typeof process !== 'undefined' ? process.env['EXPORT_URL'] : undefined) ??
  'http://localhost:8098';

export const BOOTSTRAP_DASHBOARD_EXPORTS: ReadonlyArray<DashboardExportJob> = [];

/**
 * Queue a new dashboard export job.
 *
 * Throws when the upstream is unreachable so the UI can surface an
 * error to the operator. Returns the canonical job descriptor on
 * success — never fabricated download URLs.
 */
export async function queueDashboardExport(
  workspaceId: string,
  format: DashboardExportFormat,
  baseUrl: string = DEFAULT_BASE,
): Promise<DashboardExportJob> {
  const json = await fetcher<ExportJobWire>(baseUrl, '/v1/exports/jobs', {
    method: 'POST',
    workspaceId,
    body: {
      workspace_id: workspaceId,
      format,
    },
  });
  return mapJob(json);
}

/**
 * Fetch the latest dashboard export jobs for a workspace.
 *
 * Returns an empty array on any failure.
 */
export async function listDashboardExports(
  workspaceId: string,
  baseUrl: string = DEFAULT_BASE,
  limit: number = 25,
): Promise<ReadonlyArray<DashboardExportJob>> {
  try {
    const json = await fetcher<{ jobs?: ExportJobWire[] }>(baseUrl, '/v1/exports/jobs', {
      workspaceId,
    });
    const all = (json.jobs ?? []).map(mapJob);
    return all.slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Poll the status of a single export job.
 *
 * Returns `null` when the upstream is unreachable.
 */
export async function getDashboardExport(
  workspaceId: string,
  jobId: string,
  baseUrl: string = DEFAULT_BASE,
): Promise<DashboardExportJob | null> {
  try {
    const json = await fetcher<ExportJobWire>(
      baseUrl,
      `/v1/exports/jobs/${encodeURIComponent(jobId)}`,
      { workspaceId },
    );
    return mapJob(json);
  } catch {
    return null;
  }
}

/**
 * Wave 7 §S7.11 — scheduled dashboard exports (recurring email /
 * Slack / PDF). The export-svc owns the cron schedule; the dashboard
 * just lists + creates + cancels scheduled reports.
 */
export type ScheduleFrequency = 'daily' | 'weekly' | 'monthly';
export type ScheduleChannel = 'email' | 'slack';
export type ScheduleFormat = 'csv' | 'pdf' | 'parquet';

export interface ScheduledReport {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly format: ScheduleFormat;
  readonly frequency: ScheduleFrequency;
  readonly channel: ScheduleChannel;
  readonly target: string;
  readonly createdAtMs: number;
  readonly nextRunAtMs: number;
}

export interface CreateScheduledReportInput {
  readonly name: string;
  readonly format: ScheduleFormat;
  readonly frequency: ScheduleFrequency;
  readonly channel: ScheduleChannel;
  readonly target: string;
}

interface ScheduledReportWire {
  id?: string;
  workspace_id?: string;
  name?: string;
  format?: string;
  frequency?: string;
  channel?: string;
  target?: string;
  created_at_ms?: number;
  next_run_at_ms?: number;
}

const VALID_FREQUENCIES: ReadonlyArray<ScheduleFrequency> = ['daily', 'weekly', 'monthly'];
const VALID_CHANNELS: ReadonlyArray<ScheduleChannel> = ['email', 'slack'];
const VALID_FORMATS: ReadonlyArray<ScheduleFormat> = ['csv', 'pdf', 'parquet'];

function asFrequency(value: string | undefined): ScheduleFrequency {
  return (VALID_FREQUENCIES as readonly string[]).includes(value ?? '')
    ? (value as ScheduleFrequency)
    : 'weekly';
}

function asChannel(value: string | undefined): ScheduleChannel {
  return (VALID_CHANNELS as readonly string[]).includes(value ?? '')
    ? (value as ScheduleChannel)
    : 'email';
}

function asFormatScheduled(value: string | undefined): ScheduleFormat {
  return (VALID_FORMATS as readonly string[]).includes(value ?? '')
    ? (value as ScheduleFormat)
    : 'pdf';
}

function mapScheduledReport(raw: ScheduledReportWire): ScheduledReport {
  const now = Date.now();
  return {
    id: String(raw.id ?? ''),
    workspaceId: String(raw.workspace_id ?? ''),
    name: String(raw.name ?? ''),
    format: asFormatScheduled(raw.format),
    frequency: asFrequency(raw.frequency),
    channel: asChannel(raw.channel),
    target: String(raw.target ?? ''),
    createdAtMs: Number(raw.created_at_ms ?? now),
    nextRunAtMs: Number(raw.next_run_at_ms ?? now + 7 * 24 * 60 * 60 * 1000),
  };
}

/**
 * Fetch scheduled reports for a workspace. Returns an empty list on
 * any failure.
 */
export async function listScheduledReports(
  workspaceId: string,
  baseUrl: string = DEFAULT_BASE,
): Promise<ReadonlyArray<ScheduledReport>> {
  try {
    const json = await fetcher<{ schedules?: ScheduledReportWire[] }>(
      baseUrl,
      '/v1/exports/schedules',
      { workspaceId },
    );
    return (json.schedules ?? []).map(mapScheduledReport);
  } catch {
    return [];
  }
}

/**
 * Create a new scheduled report. Throws on upstream failure.
 */
export async function createScheduledReport(
  workspaceId: string,
  input: CreateScheduledReportInput,
  baseUrl: string = DEFAULT_BASE,
): Promise<ScheduledReport> {
  const json = await fetcher<ScheduledReportWire>(baseUrl, '/v1/exports/schedules', {
    method: 'POST',
    workspaceId,
    body: {
      workspace_id: workspaceId,
      name: input.name,
      format: input.format,
      frequency: input.frequency,
      channel: input.channel,
      target: input.target,
    },
  });
  return mapScheduledReport(json);
}

/**
 * Cancel a scheduled report. Returns `true` when the upstream
 * acknowledges cancellation.
 */
export async function cancelScheduledReport(
  workspaceId: string,
  scheduleId: string,
  baseUrl: string = DEFAULT_BASE,
): Promise<boolean> {
  const url = new URL(`/v1/exports/schedules/${encodeURIComponent(scheduleId)}`, baseUrl);
  url.searchParams.set('workspace_id', workspaceId);
  try {
    const res = await fetch(url.toString(), {
      method: 'DELETE',
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
}
