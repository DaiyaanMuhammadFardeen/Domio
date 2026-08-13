/**
 * /export — landing for the streaming export endpoint.
 *
 * Per Wave 7 §S7.1 of docs/frontend-roadmap/07-wave-analytics-insights.md:
 *   - Wired to `POST /v1/exports/jobs` + polling `GET /v1/exports/jobs/{id}`.
 *   - No stub URLs — the download button only appears once the job
 *     is `done`.
 *   - SuspenseBoundary wraps the polling client.
 *
 * Wave 7 §S7.11 also mounts the ScheduledReportForm so users can
 * create recurring email / Slack / PDF exports.
 */

import { SuspenseBoundary } from '@domio/ui';
import { ExportJobsClient } from '../../components/ExportJobsClient';
import { ScheduledReportForm } from '../../components/ScheduledReportForm';

export default function ExportPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Export</h1>
        <p className="text-sm text-slate-500">
          Queue CSV / PDF exports and poll for completion
        </p>
      </header>

      <SuspenseBoundary>
        <ExportJobsClient />
      </SuspenseBoundary>

      <ScheduledReportForm workspaceId={process.env['NEXT_PUBLIC_WORKSPACE_ID'] ?? 'ws-demo'} />
    </div>
  );
}