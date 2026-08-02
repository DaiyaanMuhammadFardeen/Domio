/**
 * Lint service — persistence layer.
 *
 * Lint runs are persisted as immutable snapshots so the editor can
 * diff lint output over time.  Each run is keyed by `(orgId, runId)`
 * and stores the full finding array.
 */

import type { LintFinding, LintSeverity } from './service.js';

export interface LintRunRecord {
  readonly runId: string;
  readonly orgId: string;
  readonly deckId: string;
  readonly brandKitId?: string;
  readonly ruleIds: readonly string[];
  readonly findings: readonly LintFinding[];
  readonly blockCount: number;
  readonly warnCount: number;
  readonly infoCount: number;
  readonly elementsScanned: number;
  readonly startedAt: Date;
  readonly completedAt: Date;
}

export interface LintRunRepository {
  insert(record: LintRunRecord): Promise<void>;
  findById(runId: string, orgId: string): Promise<LintRunRecord | null>;
  listByDeck(deckId: string, orgId: string, limit?: number): Promise<LintRunRecord[]>;
  latestByDeck(deckId: string, orgId: string): Promise<LintRunRecord | null>;
}

export class InMemoryLintRunRepository implements LintRunRepository {
  private store = new Map<string, LintRunRecord>();
  private k(r: LintRunRecord): string { return `${r.orgId}::${r.runId}`; }
  async insert(record: LintRunRecord): Promise<void> {
    this.store.set(this.k(record), record);
  }
  async findById(runId: string, orgId: string): Promise<LintRunRecord | null> {
    return this.store.get(`${orgId}::${runId}`) ?? null;
  }
  async listByDeck(deckId: string, orgId: string, limit = 20): Promise<LintRunRecord[]> {
    const out: LintRunRecord[] = [];
    for (const r of this.store.values()) {
      if (r.orgId === orgId && r.deckId === deckId) out.push(r);
    }
    return out.slice(-limit);
  }
  async latestByDeck(deckId: string, orgId: string): Promise<LintRunRecord | null> {
    let latest: LintRunRecord | null = null;
    for (const r of this.store.values()) {
      if (r.orgId !== orgId || r.deckId !== deckId) continue;
      if (!latest || r.completedAt > latest.completedAt) latest = r;
    }
    return latest;
  }
}

export type { LintFinding, LintSeverity };