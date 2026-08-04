/**
 * Scenario-manager service — scenario CRUD with parent validation,
 * overlay management, and diff computation.
 *
 * The service is the entry point for all business logic.  REST handlers
 * wrap this service; the Postgres DAL is swapped in at composition time.
 */

import type {
  ScenarioRecord,
  OverlayRecord,
  ScenarioRepository,
  OverlayRepository,
  AnnotationRepository,
  ThresholdRuleRepository,
} from './dal.js';
import { validateParent, ancestors, descendants } from './dag.js';
import { applyOverlays as mergeOverlays, diff as overlayDiff, type OverlayState } from './overlays.js';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ScenarioNotFoundError extends Error {
  readonly code = 'SCENARIO_NOT_FOUND' as const;
  constructor(public readonly scenarioId: string) {
    super(`Scenario ${scenarioId} not found`);
    this.name = 'ScenarioNotFoundError';
  }
}

export { ScenarioCycleError, ScenarioDepthExceededError } from './dag.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScenarioServiceOptions {
  readonly scenarios: ScenarioRepository;
  readonly overlays: OverlayRepository;
  readonly annotations: AnnotationRepository;
  readonly thresholdRules: ThresholdRuleRepository;
  readonly idGenerator?: () => string;
  readonly clock?: () => Date;
}

export interface CreateScenarioInput {
  readonly tenantId: string;
  readonly deckId: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly description: string;
  readonly createdBy: string;
}

export interface CreateOverlayInput {
  readonly tenantId: string;
  readonly scenarioId: string;
  readonly datasetSnapshotRefs: readonly string[];
  readonly formulaConstantOverrides: ReadonlyMap<string, number>;
  readonly sliderValueOverrides: ReadonlyMap<string, number>;
  readonly annotationOverrides: ReadonlyMap<string, string>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const defaultId = () => `scn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const defaultClock = () => new Date();

export class ScenarioService {
  private readonly scenarios: ScenarioRepository;
  private readonly overlays: OverlayRepository;
  private readonly idGen: () => string;
  private readonly clock: () => Date;

  constructor(opts: ScenarioServiceOptions) {
    this.scenarios = opts.scenarios;
    this.overlays = opts.overlays;
    this.idGen = opts.idGenerator ?? defaultId;
    this.clock = opts.clock ?? defaultClock;
  }

  // -------------------------------------------------------------------------
  // Scenario CRUD
  // -------------------------------------------------------------------------

  async createScenario(input: CreateScenarioInput): Promise<ScenarioRecord> {
    // Validate parent if non-null
    if (input.parentId !== null) {
      const parent = await this.scenarios.findById(input.parentId, input.tenantId);
      if (!parent) {
        throw new ScenarioNotFoundError(input.parentId);
      }
      // Ensure same deck
      if (parent.deckId !== input.deckId) {
        throw new Error(`Parent scenario ${input.parentId} belongs to a different deck`);
      }
    }

    // Gather all scenarios in the deck for DAG validation
    const deckScenarios = await this.scenarios.listByDeck(input.deckId, input.tenantId);

    // Build a temporary scenario record for validation
    const tempRecord: ScenarioRecord = {
      id: '__temp__',
      tenantId: input.tenantId,
      deckId: input.deckId,
      parentId: input.parentId,
      name: input.name,
      description: input.description,
      createdAt: this.clock(),
    };

    // Validate parent (throws on cycle or depth exceeded)
    validateParent(tempRecord, input.parentId, deckScenarios);

    const id = this.idGen();
    const record: ScenarioRecord = {
      id,
      tenantId: input.tenantId,
      deckId: input.deckId,
      parentId: input.parentId,
      name: input.name,
      description: input.description,
      createdAt: this.clock(),
    };

    await this.scenarios.insert(record);
    return record;
  }

  async getScenario(id: string, tenantId: string): Promise<ScenarioRecord> {
    const record = await this.scenarios.findById(id, tenantId);
    if (!record) throw new ScenarioNotFoundError(id);
    return record;
  }

  async listByDeck(deckId: string, tenantId: string): Promise<ScenarioRecord[]> {
    return this.scenarios.listByDeck(deckId, tenantId);
  }

  async updateScenario(
    id: string,
    tenantId: string,
    patch: { name?: string; description?: string; parentId?: string | null },
    createdBy: string,
  ): Promise<ScenarioRecord> {
    void createdBy;
    const existing = await this.getScenario(id, tenantId);

    // If reparenting, validate the new parent
    if (patch.parentId !== undefined && patch.parentId !== existing.parentId) {
      if (patch.parentId !== null) {
        const parent = await this.scenarios.findById(patch.parentId, tenantId);
        if (!parent) throw new ScenarioNotFoundError(patch.parentId);
        if (parent.deckId !== existing.deckId) {
          throw new Error(`Parent scenario ${patch.parentId} belongs to a different deck`);
        }
      }

      const deckScenarios = await this.scenarios.listByDeck(existing.deckId, tenantId);
      // Remove existing record from the deck list and re-add with the new parentId
      const filtered = deckScenarios.filter((s) => s.id !== id);
      const updatedRecord: ScenarioRecord = { ...existing, ...patch };
      validateParent(updatedRecord, patch.parentId ?? null, filtered);
    }

    return this.scenarios.update(id, tenantId, patch);
  }

  async deleteScenario(id: string, tenantId: string): Promise<void> {
    await this.getScenario(id, tenantId); // ensures existence
    // Check no children reference this as parent
    const existing = await this.scenarios.findById(id, tenantId);
    if (!existing) throw new ScenarioNotFoundError(id);
    const deckScenarios = await this.scenarios.listByDeck(existing.deckId, tenantId);
    const children = deckScenarios.filter((s) => s.parentId === id);
    if (children.length > 0) {
      throw new Error(`Cannot delete scenario ${id}: ${children.length} child scenario(s) still reference it`);
    }
    await this.scenarios.delete(id, tenantId);
  }

  // -------------------------------------------------------------------------
  // Overlay CRUD
  // -------------------------------------------------------------------------

  async upsertOverlay(input: CreateOverlayInput): Promise<OverlayRecord> {
    // Verify scenario exists
    await this.getScenario(input.scenarioId, input.tenantId);

    const record: OverlayRecord = {
      id: this.idGen(),
      scenarioId: input.scenarioId,
      tenantId: input.tenantId,
      datasetSnapshotRefs: input.datasetSnapshotRefs,
      formulaConstantOverrides: input.formulaConstantOverrides,
      sliderValueOverrides: input.sliderValueOverrides,
      annotationOverrides: input.annotationOverrides,
    };

    await this.overlays.upsert(record);
    return record;
  }

  async getOverlay(scenarioId: string, tenantId: string): Promise<OverlayRecord | null> {
    return this.overlays.findByScenario(scenarioId, tenantId);
  }

  // -------------------------------------------------------------------------
  // Diff
  // -------------------------------------------------------------------------

  async diffScenarios(
    baseId: string,
    targetId: string,
    tenantId: string,
  ): Promise<{ base: OverlayState; target: OverlayState; diff: ReturnType<typeof overlayDiff> }> {
    const baseScenario = await this.getScenario(baseId, tenantId);
    const targetScenario = await this.getScenario(targetId, tenantId);

    // Gather overlays for both scenarios
    const baseOverlay = await this.overlays.findByScenario(baseId, tenantId);
    const targetOverlay = await this.overlays.findByScenario(targetId, tenantId);

    // For overlay merge, we need all scenarios in the deck
    const deckScenarios = await this.scenarios.listByDeck(baseScenario.deckId, tenantId);

    const overlayMap = new Map<string, OverlayRecord>();
    if (baseOverlay) overlayMap.set(baseOverlay.scenarioId, baseOverlay);
    if (targetOverlay) overlayMap.set(targetOverlay.scenarioId, targetOverlay);

    // Also load overlays for ancestor scenarios
    const allIds = new Set([
      ...ancestors(baseId, deckScenarios),
      ...ancestors(targetId, deckScenarios),
    ]);
    for (const sid of allIds) {
      if (sid === baseId || sid === targetId) continue;
      const ov = await this.overlays.findByScenario(sid, tenantId);
      if (ov) overlayMap.set(sid, ov);
    }

    const baseState = mergeOverlays(baseScenario, overlayMap, deckScenarios);
    const targetState = mergeOverlays(targetScenario, overlayMap, deckScenarios);
    const d = overlayDiff(baseState, targetState);

    return { base: baseState, target: targetState, diff: d };
  }

  // -------------------------------------------------------------------------
  // Ancestors / descendants
  // -------------------------------------------------------------------------

  async getAncestors(id: string, tenantId: string): Promise<readonly string[]> {
    const scenario = await this.getScenario(id, tenantId);
    const deckScenarios = await this.scenarios.listByDeck(scenario.deckId, tenantId);
    return ancestors(id, deckScenarios);
  }

  async getDescendants(id: string, tenantId: string): Promise<readonly string[]> {
    const scenario = await this.getScenario(id, tenantId);
    const deckScenarios = await this.scenarios.listByDeck(scenario.deckId, tenantId);
    return descendants(id, deckScenarios);
  }
}
