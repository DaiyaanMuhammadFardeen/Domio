/**
 * Data service — lists live datasets available to bind a slide to.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Today: returns an empty list (no live datasets attached). The
 * data-source-panel renders an empty state when the list is empty.
 * The data-svc client will replace this in a later wave.
 */

export interface DatasetDescriptor {
  readonly id: string;
  readonly name: string;
  readonly kind: 'sheet' | 'postgres' | 'bigquery' | 'csv-upload';
  readonly updatedAtMs: number;
}

export const BOOTSTRAP_DATASETS: ReadonlyArray<DatasetDescriptor> = [];

export async function listDatasets(_workspaceId: string): Promise<ReadonlyArray<DatasetDescriptor>> {
  return BOOTSTRAP_DATASETS;
}