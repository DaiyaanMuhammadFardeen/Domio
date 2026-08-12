/**
 * Statement service — creator-side earnings statements.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 */

import { fetcher } from './fetcher';

const API_BASE = process.env['NEXT_PUBLIC_API_BASE'] ?? 'http://localhost:8080';

export interface StatementRow {
  readonly id: string;
  readonly periodStartMs: number;
  readonly periodEndMs: number;
  readonly earningsCents: number;
}

export const BOOTSTRAP_STATEMENTS: ReadonlyArray<StatementRow> = [];

export async function listStatements(workspaceId: string): Promise<ReadonlyArray<StatementRow>> {
  try {
    const json = await fetcher<{ rows?: StatementRow[] }>(
      API_BASE,
      `/v1/creator/statements?workspace_id=${encodeURIComponent(workspaceId)}`,
    );
    return json.rows ?? [];
  } catch {
    return [];
  }
}