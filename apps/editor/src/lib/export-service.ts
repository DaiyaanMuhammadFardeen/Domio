/**
 * Export service — exports a deck to PDF / PPTX / HTML bundle.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Today: returns a placeholder export descriptor. The export-svc
 * client will replace this in a later wave.
 */

export type ExportFormat = 'pdf' | 'pptx' | 'html';

export interface ExportJob {
  readonly id: string;
  readonly deckId: string;
  readonly format: ExportFormat;
  readonly status: 'queued' | 'running' | 'done' | 'failed';
  readonly downloadUrl?: string;
  readonly createdAtMs: number;
}

export const BOOTSTRAP_EXPORT_JOBS: ReadonlyArray<ExportJob> = [];

export async function queueExport(
  deckId: string,
  format: ExportFormat,
): Promise<ExportJob> {
  return {
    id: `export-${deckId}-${format}-${Date.now()}`,
    deckId,
    format,
    status: 'queued',
    createdAtMs: Date.now(),
  };
}

export async function listExportJobs(_deckId: string): Promise<ReadonlyArray<ExportJob>> {
  return BOOTSTRAP_EXPORT_JOBS;
}