/**
 * Dashboard export service — exports analytics as CSV / PDF.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Today: returns a placeholder export descriptor. The export-svc
 * client will replace this in a later wave.
 */

export type DashboardExportFormat = 'csv' | 'pdf';

export interface DashboardExportJob {
  readonly id: string;
  readonly workspaceId: string;
  readonly format: DashboardExportFormat;
  readonly status: 'queued' | 'running' | 'done' | 'failed';
  readonly downloadUrl?: string;
  readonly createdAtMs: number;
}

export const BOOTSTRAP_DASHBOARD_EXPORTS: ReadonlyArray<DashboardExportJob> = [];

export async function queueDashboardExport(
  workspaceId: string,
  format: DashboardExportFormat,
): Promise<DashboardExportJob> {
  return {
    id: `dashboard-export-${workspaceId}-${format}-${Date.now()}`,
    workspaceId,
    format,
    status: 'queued',
    createdAtMs: Date.now(),
  };
}