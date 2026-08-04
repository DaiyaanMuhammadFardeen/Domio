/**
 * Scenario-manager DAL — repository interfaces + in-memory implementations.
 *
 * Shapes mirror the SQL columns added by migration 0021_phase08_data_plane:
 *   scenario, dataset_snapshot, annotation, threshold_rule.
 * All tables are tenant-scoped with tenant_id + RLS.
 */

// ---------------------------------------------------------------------------
// Record types
// ---------------------------------------------------------------------------

export interface ScenarioRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly deckId: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly description: string;
  readonly createdAt: Date;
}

export interface OverlayRecord {
  readonly id: string;
  readonly scenarioId: string;
  readonly tenantId: string;
  readonly datasetSnapshotRefs: ReadonlyArray<string>;
  readonly formulaConstantOverrides: ReadonlyMap<string, number>;
  readonly sliderValueOverrides: ReadonlyMap<string, number>;
  readonly annotationOverrides: ReadonlyMap<string, string>;
}

export interface AnnotationRecord {
  readonly id: string;
  readonly scenarioId: string;
  readonly tenantId: string;
  readonly author: string;
  readonly body: string;
  readonly createdAt: Date;
}

export interface ThresholdRuleRecord {
  readonly id: string;
  readonly scenarioId: string;
  readonly tenantId: string;
  readonly metricKey: string;
  readonly operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'neq';
  readonly value: number;
  readonly enabled: boolean;
}

// ---------------------------------------------------------------------------
// Repository interfaces
// ---------------------------------------------------------------------------

export interface ScenarioRepository {
  insert(record: ScenarioRecord): Promise<void>;
  findById(id: string, tenantId: string): Promise<ScenarioRecord | null>;
  listByDeck(deckId: string, tenantId: string): Promise<ScenarioRecord[]>;
  update(
    id: string,
    tenantId: string,
    patch: Partial<Pick<ScenarioRecord, 'name' | 'description' | 'parentId'>>,
  ): Promise<ScenarioRecord>;
  delete(id: string, tenantId: string): Promise<void>;
}

export interface OverlayRepository {
  upsert(record: OverlayRecord): Promise<void>;
  findByScenario(scenarioId: string, tenantId: string): Promise<OverlayRecord | null>;
}

export interface AnnotationRepository {
  insert(record: AnnotationRecord): Promise<void>;
  listByScenario(scenarioId: string, tenantId: string): Promise<AnnotationRecord[]>;
}

export interface ThresholdRuleRepository {
  insert(record: ThresholdRuleRecord): Promise<void>;
  listByScenario(scenarioId: string, tenantId: string): Promise<ThresholdRuleRecord[]>;
}

// ---------------------------------------------------------------------------
// In-memory implementations
// ---------------------------------------------------------------------------

export class InMemoryScenarioRepository implements ScenarioRepository {
  private store = new Map<string, ScenarioRecord>();

  private k(id: string, tenantId: string): string {
    return `${tenantId}::${id}`;
  }

  async insert(record: ScenarioRecord): Promise<void> {
    this.store.set(this.k(record.id, record.tenantId), record);
  }

  async findById(id: string, tenantId: string): Promise<ScenarioRecord | null> {
    return this.store.get(this.k(id, tenantId)) ?? null;
  }

  async listByDeck(deckId: string, tenantId: string): Promise<ScenarioRecord[]> {
    const out: ScenarioRecord[] = [];
    for (const r of this.store.values()) {
      if (r.tenantId === tenantId && r.deckId === deckId) out.push(r);
    }
    return out;
  }

  async update(
    id: string,
    tenantId: string,
    patch: Partial<Pick<ScenarioRecord, 'name' | 'description' | 'parentId'>>,
  ): Promise<ScenarioRecord> {
    const existing = await this.findById(id, tenantId);
    if (!existing) throw new Error(`Scenario ${id} not found for tenant ${tenantId}`);
    const updated: ScenarioRecord = { ...existing, ...patch };
    this.store.set(this.k(id, tenantId), updated);
    return updated;
  }

  async delete(id: string, tenantId: string): Promise<void> {
    this.store.delete(this.k(id, tenantId));
  }
}

export class InMemoryOverlayRepository implements OverlayRepository {
  private store = new Map<string, OverlayRecord>();

  async upsert(record: OverlayRecord): Promise<void> {
    this.store.set(`${record.tenantId}::${record.scenarioId}`, record);
  }

  async findByScenario(scenarioId: string, tenantId: string): Promise<OverlayRecord | null> {
    return this.store.get(`${tenantId}::${scenarioId}`) ?? null;
  }
}

export class InMemoryAnnotationRepository implements AnnotationRepository {
  private store: AnnotationRecord[] = [];

  async insert(record: AnnotationRecord): Promise<void> {
    this.store.push(record);
  }

  async listByScenario(scenarioId: string, tenantId: string): Promise<AnnotationRecord[]> {
    return this.store.filter((r) => r.scenarioId === scenarioId && r.tenantId === tenantId);
  }
}

export class InMemoryThresholdRuleRepository implements ThresholdRuleRepository {
  private store: ThresholdRuleRecord[] = [];

  async insert(record: ThresholdRuleRecord): Promise<void> {
    this.store.push(record);
  }

  async listByScenario(scenarioId: string, tenantId: string): Promise<ThresholdRuleRecord[]> {
    return this.store.filter((r) => r.scenarioId === scenarioId && r.tenantId === tenantId);
  }
}
