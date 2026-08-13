/**
 * Prototype-runtime service — persistence layer (Phase 10 M1 + M2).
 *
 * All repositories are tenant-scoped (keyed by `tenantId::id`).
 * Optimistic locking is enforced by `version`.
 *
 * The wire shape reuses the runtime types verbatim; the runtime is
 * in-process and the service is the persisted CRUD layer that the
 * editor, viewer, and (future) MCP surface target.
 */

import type {
  Hotspot,
  Overlay,
  BranchingEdge,
  InteractionState,
  Variable,
  VariableBinding,
  ConditionalRule,
  Quiz,
  QuizAttempt,
  QuizAnswer,
  QuizResult,
  LlmReviewQueueItem,
  PresentationSequence,
  VariableScope,
  VariableType,
  VariableVisibility,
} from '@domio/prototype-runtime';

// ── Repository interfaces ──────────────────────────────────────────────

export interface HotspotRepository {
  insert(record: Hotspot): Promise<void>;
  findById(id: string, tenantId: string): Promise<Hotspot | null>;
  listByDeck(deckId: string, tenantId: string, slideId?: string): Promise<Hotspot[]>;
  update(id: string, tenantId: string, patch: HotspotPatch, version: number): Promise<Hotspot>;
  delete(id: string, tenantId: string): Promise<void>;
}

export interface OverlayRepository {
  insert(record: Overlay): Promise<void>;
  findById(id: string, tenantId: string): Promise<Overlay | null>;
  listByDeck(deckId: string, tenantId: string, slideId?: string): Promise<Overlay[]>;
  update(id: string, tenantId: string, patch: OverlayPatch, version: number): Promise<Overlay>;
  delete(id: string, tenantId: string): Promise<void>;
}

export interface BranchingEdgeRepository {
  insert(record: BranchingEdge): Promise<void>;
  findById(id: string, tenantId: string): Promise<BranchingEdge | null>;
  listByDeck(deckId: string, tenantId: string): Promise<BranchingEdge[]>;
  update(id: string, tenantId: string, patch: BranchingEdgePatch): Promise<BranchingEdge>;
  delete(id: string, tenantId: string): Promise<void>;
}

export interface InteractionStateRepository {
  insert(record: InteractionState): Promise<void>;
  findById(id: string, tenantId: string): Promise<InteractionState | null>;
  findByInstance(instanceId: string, tenantId: string): Promise<InteractionState | null>;
  listByDeck(deckId: string, tenantId: string): Promise<InteractionState[]>;
  update(id: string, tenantId: string, patch: Partial<InteractionState>): Promise<InteractionState>;
  delete(id: string, tenantId: string): Promise<void>;
}

export interface VariableRepository {
  insert(record: Variable): Promise<void>;
  findById(id: string, tenantId: string): Promise<Variable | null>;
  findByName(deckId: string, tenantId: string, name: string): Promise<Variable | null>;
  listByDeck(deckId: string, tenantId: string): Promise<Variable[]>;
  update(id: string, tenantId: string, patch: VariablePatch, version: number): Promise<Variable>;
  delete(id: string, tenantId: string): Promise<void>;
}

export interface VariableBindingRepository {
  insert(record: VariableBinding): Promise<void>;
  findById(id: string, tenantId: string): Promise<VariableBinding | null>;
  listByDeck(deckId: string, tenantId: string): Promise<VariableBinding[]>;
  delete(id: string, tenantId: string): Promise<void>;
}

export interface ConditionalRuleRepository {
  insert(record: ConditionalRule): Promise<void>;
  findById(id: string, tenantId: string): Promise<ConditionalRule | null>;
  listByDeck(deckId: string, tenantId: string): Promise<ConditionalRule[]>;
  update(
    id: string,
    tenantId: string,
    patch: ConditionalRulePatch,
    version: number,
  ): Promise<ConditionalRule>;
  delete(id: string, tenantId: string): Promise<void>;
}

// ── Quiz (M6.1) ────────────────────────────────────────────────────────

export interface QuizRepository {
  insert(record: Quiz): Promise<void>;
  findById(id: string, tenantId: string): Promise<Quiz | null>;
  listByDeck(deckId: string, tenantId: string): Promise<Quiz[]>;
  update(id: string, tenantId: string, patch: QuizPatch, version: number): Promise<Quiz>;
  delete(id: string, tenantId: string): Promise<void>;
}

export interface QuizAttemptRepository {
  insert(record: QuizAttempt): Promise<void>;
  findById(id: string, tenantId: string): Promise<QuizAttempt | null>;
  listByQuiz(quizId: string, tenantId: string): Promise<QuizAttempt[]>;
  update(id: string, tenantId: string, patch: QuizAttemptPatch): Promise<QuizAttempt>;
}

export interface QuizAnswerRepository {
  insert(record: QuizAnswer): Promise<void>;
  listByAttempt(attemptId: string, tenantId: string): Promise<QuizAnswer[]>;
}

export interface QuizResultRepository {
  insert(record: QuizResult): Promise<void>;
  findByAttempt(attemptId: string, tenantId: string): Promise<QuizResult | null>;
}

export interface LlmReviewQueueRepository {
  insert(record: LlmReviewQueueItem): Promise<void>;
  listByTenant(
    tenantId: string,
    status?: LlmReviewQueueItem['status'],
  ): Promise<LlmReviewQueueItem[]>;
  update(
    id: string,
    tenantId: string,
    patch: {
      readonly status?: LlmReviewQueueItem['status'];
      readonly reviewerId?: string | null;
      readonly overrideScore?: number | null;
    },
  ): Promise<LlmReviewQueueItem>;
}

// ── Presentation sequence (M6.2) ───────────────────────────────────────

export interface PresentationSequenceRepository {
  insert(record: PresentationSequence): Promise<void>;
  findById(id: string, tenantId: string): Promise<PresentationSequence | null>;
  listByDeck(deckId: string, tenantId: string): Promise<PresentationSequence[]>;
  update(
    id: string,
    tenantId: string,
    patch: PresentationSequencePatch,
    version: number,
  ): Promise<PresentationSequence>;
  delete(id: string, tenantId: string): Promise<void>;
}

// ── Patch types ────────────────────────────────────────────────────────

// `Writable<T>` strips the `readonly` modifier so callers can build patches
// incrementally. The domain types are immutable via `readonly` so this
// gives the service a writable harness.
type Writable<T> = { -readonly [K in keyof T]: T[K] };

export type HotspotPatch = Partial<
  Writable<
    Pick<
      Hotspot,
      'name' | 'geometry' | 'gestureMask' | 'zIndex' | 'targetType' | 'targetRef' | 'status'
    >
  >
>;

export type OverlayPatch = Partial<
  Writable<
    Pick<
      Overlay,
      | 'name'
      | 'type'
      | 'sizeStrategy'
      | 'anchor'
      | 'openTrigger'
      | 'closeTrigger'
      | 'persistent'
      | 'schema'
    >
  >
>;

export type BranchingEdgePatch = Partial<
  Writable<Pick<BranchingEdge, 'toSlideId' | 'name' | 'ruleId' | 'priority'>>
>;

export type VariablePatch = Partial<
  Writable<
    Pick<
      Variable,
      'scope' | 'enumValues' | 'min' | 'max' | 'defaultValue' | 'visibility' | 'readOnly'
    >
  >
>;

export type ConditionalRulePatch = Partial<
  Writable<
    Pick<
      ConditionalRule,
      'name' | 'priority' | 'condition' | 'conditionSource' | 'scopeSlideId' | 'action' | 'enabled'
    >
  >
>;

export type QuizPatch = Partial<Writable<Pick<Quiz, 'name' | 'questions' | 'passThreshold'>>>;

export type QuizAttemptPatch = Partial<
  Writable<Pick<QuizAttempt, 'currentQuestionId' | 'status' | 'completedAt' | 'score' | 'passed'>>
>;

export type PresentationSequencePatch = Partial<
  Writable<
    Pick<
      PresentationSequence,
      | 'name'
      | 'slides'
      | 'intervalMs'
      | 'pauseOnEvent'
      | 'loop'
      | 'count'
      | 'interruptionPolicy'
      | 'reducedMotionDefaultOff'
      | 'pauseWarnAtMs'
    >
  >
>;

// ── Errors ─────────────────────────────────────────────────────────────

export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND' as const;
  constructor(
    public readonly resource: string,
    public readonly id: string,
  ) {
    super(`${resource} ${id} not found`);
    this.name = 'NotFoundError';
  }
}

export class VersionConflictError extends Error {
  readonly code = 'VERSION_CONFLICT' as const;
  constructor(
    public readonly resource: string,
    public readonly id: string,
    public readonly currentVersion: number,
  ) {
    super(`Version conflict on ${resource} ${id}: current version is ${currentVersion}`);
    this.name = 'VersionConflictError';
  }
}

export class DuplicateVariableNameError extends Error {
  readonly code = 'DUPLICATE_VARIABLE_NAME' as const;
  constructor(
    public readonly deckId: string,
    public readonly name: string,
  ) {
    super(`Variable "${name}" already exists in deck ${deckId}`);
    this.name = 'DuplicateVariableNameError';
  }
}

export class DuplicateBranchingEdgeError extends Error {
  readonly code = 'DUPLICATE_BRANCHING_EDGE' as const;
  constructor(
    public readonly fromSlideId: string,
    public readonly toSlideId: string,
  ) {
    super(`Branching edge ${fromSlideId} → ${toSlideId} already exists`);
    this.name = 'DuplicateBranchingEdgeError';
  }
}

export class VariableValidationError extends Error {
  readonly code = 'VARIABLE_VALIDATION_ERROR' as const;
  constructor(public readonly reason: string) {
    super(`Variable validation failed: ${reason}`);
    this.name = 'VariableValidationError';
  }
}

// ── In-memory implementations ──────────────────────────────────────────

abstract class InMemoryRepo<R extends { readonly id: string; readonly tenantId: string }> {
  protected store = new Map<string, R>();
  protected k(r: R): string {
    return `${r.tenantId}::${r.id}`;
  }
}

export class InMemoryHotspotRepository extends InMemoryRepo<Hotspot> implements HotspotRepository {
  async insert(record: Hotspot): Promise<void> {
    this.store.set(this.k(record), record);
  }

  async findById(id: string, tenantId: string): Promise<Hotspot | null> {
    return this.store.get(`${tenantId}::${id}`) ?? null;
  }

  async listByDeck(deckId: string, tenantId: string, slideId?: string): Promise<Hotspot[]> {
    const out: Hotspot[] = [];
    for (const r of this.store.values()) {
      if (r.tenantId !== tenantId) continue;
      if (r.deckId !== deckId) continue;
      if (slideId && r.slideId !== slideId) continue;
      out.push(r);
    }
    return out;
  }

  async update(
    id: string,
    tenantId: string,
    patch: HotspotPatch,
    version: number,
  ): Promise<Hotspot> {
    const existing = await this.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Hotspot', id);
    if (existing.version !== version)
      throw new VersionConflictError('Hotspot', id, existing.version);
    const updated: Hotspot = {
      ...existing,
      ...patch,
      version: existing.version + 1,
      updatedAt: Date.now(),
    };
    this.store.set(this.k(updated), updated);
    return updated;
  }

  async delete(id: string, tenantId: string): Promise<void> {
    this.store.delete(`${tenantId}::${id}`);
  }
}

export class InMemoryOverlayRepository extends InMemoryRepo<Overlay> implements OverlayRepository {
  async insert(record: Overlay): Promise<void> {
    this.store.set(this.k(record), record);
  }

  async findById(id: string, tenantId: string): Promise<Overlay | null> {
    return this.store.get(`${tenantId}::${id}`) ?? null;
  }

  async listByDeck(deckId: string, tenantId: string, slideId?: string): Promise<Overlay[]> {
    const out: Overlay[] = [];
    for (const r of this.store.values()) {
      if (r.tenantId !== tenantId) continue;
      if (r.deckId !== deckId) continue;
      if (slideId && r.slideId !== slideId) continue;
      out.push(r);
    }
    return out;
  }

  async update(
    id: string,
    tenantId: string,
    patch: OverlayPatch,
    version: number,
  ): Promise<Overlay> {
    const existing = await this.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Overlay', id);
    if (existing.version !== version)
      throw new VersionConflictError('Overlay', id, existing.version);
    const updated: Overlay = {
      ...existing,
      ...patch,
      version: existing.version + 1,
      updatedAt: Date.now(),
    };
    this.store.set(this.k(updated), updated);
    return updated;
  }

  async delete(id: string, tenantId: string): Promise<void> {
    this.store.delete(`${tenantId}::${id}`);
  }
}

export class InMemoryBranchingEdgeRepository
  extends InMemoryRepo<BranchingEdge>
  implements BranchingEdgeRepository
{
  async insert(record: BranchingEdge): Promise<void> {
    for (const existing of this.store.values()) {
      if (
        existing.tenantId === record.tenantId &&
        existing.deckId === record.deckId &&
        existing.fromSlideId === record.fromSlideId &&
        existing.toSlideId === record.toSlideId
      ) {
        throw new DuplicateBranchingEdgeError(record.fromSlideId, record.toSlideId);
      }
    }
    this.store.set(this.k(record), record);
  }

  async findById(id: string, tenantId: string): Promise<BranchingEdge | null> {
    return this.store.get(`${tenantId}::${id}`) ?? null;
  }

  async listByDeck(deckId: string, tenantId: string): Promise<BranchingEdge[]> {
    const out: BranchingEdge[] = [];
    for (const r of this.store.values()) {
      if (r.tenantId === tenantId && r.deckId === deckId) out.push(r);
    }
    return out;
  }

  async update(id: string, tenantId: string, patch: BranchingEdgePatch): Promise<BranchingEdge> {
    const existing = await this.findById(id, tenantId);
    if (!existing) throw new NotFoundError('BranchingEdge', id);
    const updated: BranchingEdge = { ...existing, ...patch };
    this.store.set(this.k(updated), updated);
    return updated;
  }

  async delete(id: string, tenantId: string): Promise<void> {
    this.store.delete(`${tenantId}::${id}`);
  }
}

export class InMemoryInteractionStateRepository
  extends InMemoryRepo<InteractionState>
  implements InteractionStateRepository
{
  async insert(record: InteractionState): Promise<void> {
    this.store.set(this.k(record), record);
  }

  async findById(id: string, tenantId: string): Promise<InteractionState | null> {
    return this.store.get(`${tenantId}::${id}`) ?? null;
  }

  async findByInstance(instanceId: string, tenantId: string): Promise<InteractionState | null> {
    for (const r of this.store.values()) {
      if (r.tenantId === tenantId && r.instanceId === instanceId) return r;
    }
    return null;
  }

  async listByDeck(deckId: string, tenantId: string): Promise<InteractionState[]> {
    const out: InteractionState[] = [];
    for (const r of this.store.values()) {
      if (r.tenantId === tenantId && r.deckId === deckId) out.push(r);
    }
    return out;
  }

  async update(
    id: string,
    tenantId: string,
    patch: Partial<InteractionState>,
  ): Promise<InteractionState> {
    const existing = await this.findById(id, tenantId);
    if (!existing) throw new NotFoundError('InteractionState', id);
    const updated: InteractionState = { ...existing, ...patch, updatedAt: Date.now() };
    this.store.set(this.k(updated), updated);
    return updated;
  }

  async delete(id: string, tenantId: string): Promise<void> {
    this.store.delete(`${tenantId}::${id}`);
  }
}

export class InMemoryVariableRepository
  extends InMemoryRepo<Variable>
  implements VariableRepository
{
  async insert(record: Variable): Promise<void> {
    for (const existing of this.store.values()) {
      if (
        existing.tenantId === record.tenantId &&
        existing.deckId === record.deckId &&
        existing.name === record.name
      ) {
        throw new DuplicateVariableNameError(record.deckId, record.name);
      }
    }
    this.store.set(this.k(record), record);
  }

  async findById(id: string, tenantId: string): Promise<Variable | null> {
    return this.store.get(`${tenantId}::${id}`) ?? null;
  }

  async findByName(deckId: string, tenantId: string, name: string): Promise<Variable | null> {
    for (const r of this.store.values()) {
      if (r.tenantId === tenantId && r.deckId === deckId && r.name === name) return r;
    }
    return null;
  }

  async listByDeck(deckId: string, tenantId: string): Promise<Variable[]> {
    const out: Variable[] = [];
    for (const r of this.store.values()) {
      if (r.tenantId === tenantId && r.deckId === deckId) out.push(r);
    }
    return out;
  }

  async update(
    id: string,
    tenantId: string,
    patch: VariablePatch,
    version: number,
  ): Promise<Variable> {
    const existing = await this.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Variable', id);
    if (existing.version !== version)
      throw new VersionConflictError('Variable', id, existing.version);
    const updated: Variable = {
      ...existing,
      ...patch,
      version: existing.version + 1,
      updatedAt: Date.now(),
    };
    this.store.set(this.k(updated), updated);
    return updated;
  }

  async delete(id: string, tenantId: string): Promise<void> {
    this.store.delete(`${tenantId}::${id}`);
  }
}

export class InMemoryVariableBindingRepository
  extends InMemoryRepo<VariableBinding>
  implements VariableBindingRepository
{
  async insert(record: VariableBinding): Promise<void> {
    this.store.set(this.k(record), record);
  }

  async findById(id: string, tenantId: string): Promise<VariableBinding | null> {
    return this.store.get(`${tenantId}::${id}`) ?? null;
  }

  async listByDeck(deckId: string, tenantId: string): Promise<VariableBinding[]> {
    const out: VariableBinding[] = [];
    for (const r of this.store.values()) {
      if (r.tenantId === tenantId && r.deckId === deckId) out.push(r);
    }
    return out;
  }

  async delete(id: string, tenantId: string): Promise<void> {
    this.store.delete(`${tenantId}::${id}`);
  }
}

export class InMemoryConditionalRuleRepository
  extends InMemoryRepo<ConditionalRule>
  implements ConditionalRuleRepository
{
  async insert(record: ConditionalRule): Promise<void> {
    this.store.set(this.k(record), record);
  }

  async findById(id: string, tenantId: string): Promise<ConditionalRule | null> {
    return this.store.get(`${tenantId}::${id}`) ?? null;
  }

  async listByDeck(deckId: string, tenantId: string): Promise<ConditionalRule[]> {
    const out: ConditionalRule[] = [];
    for (const r of this.store.values()) {
      if (r.tenantId === tenantId && r.deckId === deckId) out.push(r);
    }
    return out.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.createdAt - b.createdAt;
    });
  }

  async update(
    id: string,
    tenantId: string,
    patch: ConditionalRulePatch,
    version: number,
  ): Promise<ConditionalRule> {
    const existing = await this.findById(id, tenantId);
    if (!existing) throw new NotFoundError('ConditionalRule', id);
    if (existing.version !== version)
      throw new VersionConflictError('ConditionalRule', id, existing.version);
    const updated: ConditionalRule = {
      ...existing,
      ...patch,
      version: existing.version + 1,
      updatedAt: Date.now(),
    };
    this.store.set(this.k(updated), updated);
    return updated;
  }

  async delete(id: string, tenantId: string): Promise<void> {
    this.store.delete(`${tenantId}::${id}`);
  }
}

// ── Quiz in-memory implementations (M6.1) ──────────────────────────────

export class InMemoryQuizRepository extends InMemoryRepo<Quiz> implements QuizRepository {
  async insert(record: Quiz): Promise<void> {
    this.store.set(this.k(record), record);
  }

  async findById(id: string, tenantId: string): Promise<Quiz | null> {
    return this.store.get(`${tenantId}::${id}`) ?? null;
  }

  async listByDeck(deckId: string, tenantId: string): Promise<Quiz[]> {
    const out: Quiz[] = [];
    for (const r of this.store.values()) {
      if (r.tenantId === tenantId && r.deckId === deckId) out.push(r);
    }
    return out;
  }

  async update(id: string, tenantId: string, patch: QuizPatch, version: number): Promise<Quiz> {
    const existing = await this.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Quiz', id);
    if (existing.version !== version) throw new VersionConflictError('Quiz', id, existing.version);
    const updated: Quiz = {
      ...existing,
      ...patch,
      version: existing.version + 1,
      updatedAt: Date.now(),
    };
    this.store.set(this.k(updated), updated);
    return updated;
  }

  async delete(id: string, tenantId: string): Promise<void> {
    this.store.delete(`${tenantId}::${id}`);
  }
}

export class InMemoryQuizAttemptRepository
  extends InMemoryRepo<QuizAttempt>
  implements QuizAttemptRepository
{
  async insert(record: QuizAttempt): Promise<void> {
    this.store.set(this.k(record), record);
  }

  async findById(id: string, tenantId: string): Promise<QuizAttempt | null> {
    return this.store.get(`${tenantId}::${id}`) ?? null;
  }

  async listByQuiz(quizId: string, tenantId: string): Promise<QuizAttempt[]> {
    const out: QuizAttempt[] = [];
    for (const r of this.store.values()) {
      if (r.tenantId === tenantId && r.quizId === quizId) out.push(r);
    }
    return out;
  }

  async update(id: string, tenantId: string, patch: QuizAttemptPatch): Promise<QuizAttempt> {
    const existing = await this.findById(id, tenantId);
    if (!existing) throw new NotFoundError('QuizAttempt', id);
    const updated: QuizAttempt = { ...existing, ...patch };
    this.store.set(this.k(updated), updated);
    return updated;
  }
}

export class InMemoryQuizAnswerRepository implements QuizAnswerRepository {
  private store: QuizAnswer[] = [];

  async insert(record: QuizAnswer): Promise<void> {
    this.store.push(record);
  }

  async listByAttempt(attemptId: string, tenantId: string): Promise<QuizAnswer[]> {
    return this.store.filter((r) => r.tenantId === tenantId && r.attemptId === attemptId);
  }
}

export class InMemoryQuizResultRepository implements QuizResultRepository {
  private store: QuizResult[] = [];

  async insert(record: QuizResult): Promise<void> {
    this.store.push(record);
  }

  async findByAttempt(attemptId: string, tenantId: string): Promise<QuizResult | null> {
    return this.store.find((r) => r.tenantId === tenantId && r.attemptId === attemptId) ?? null;
  }
}

export class InMemoryLlmReviewQueueRepository implements LlmReviewQueueRepository {
  private store: LlmReviewQueueItem[] = [];

  async insert(record: LlmReviewQueueItem): Promise<void> {
    this.store.push(record);
  }

  async listByTenant(
    tenantId: string,
    status?: LlmReviewQueueItem['status'],
  ): Promise<LlmReviewQueueItem[]> {
    return this.store.filter((r) => {
      if (r.tenantId !== tenantId) return false;
      if (status && r.status !== status) return false;
      return true;
    });
  }

  async update(
    id: string,
    tenantId: string,
    patch: {
      readonly status?: LlmReviewQueueItem['status'];
      readonly reviewerId?: string | null;
      readonly overrideScore?: number | null;
    },
  ): Promise<LlmReviewQueueItem> {
    const idx = this.store.findIndex((r) => r.tenantId === tenantId && r.id === id);
    if (idx < 0) throw new NotFoundError('LlmReviewQueueItem', id);
    const existing = this.store[idx]!;
    const updated: LlmReviewQueueItem = {
      ...existing,
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.reviewerId !== undefined ? { reviewerId: patch.reviewerId } : {}),
      ...(patch.overrideScore !== undefined ? { overrideScore: patch.overrideScore } : {}),
      updatedAt: Date.now(),
    };
    this.store[idx] = updated;
    return updated;
  }
}

// ── Presentation sequence in-memory implementations (M6.2) ─────────────

export class InMemoryPresentationSequenceRepository
  extends InMemoryRepo<PresentationSequence>
  implements PresentationSequenceRepository
{
  async insert(record: PresentationSequence): Promise<void> {
    this.store.set(this.k(record), record);
  }

  async findById(id: string, tenantId: string): Promise<PresentationSequence | null> {
    return this.store.get(`${tenantId}::${id}`) ?? null;
  }

  async listByDeck(deckId: string, tenantId: string): Promise<PresentationSequence[]> {
    const out: PresentationSequence[] = [];
    for (const r of this.store.values()) {
      if (r.tenantId === tenantId && r.deckId === deckId) out.push(r);
    }
    return out;
  }

  async update(
    id: string,
    tenantId: string,
    patch: PresentationSequencePatch,
    version: number,
  ): Promise<PresentationSequence> {
    const existing = await this.findById(id, tenantId);
    if (!existing) throw new NotFoundError('PresentationSequence', id);
    if (existing.version !== version)
      throw new VersionConflictError('PresentationSequence', id, existing.version);
    const updated: PresentationSequence = {
      ...existing,
      ...patch,
      version: existing.version + 1,
      updatedAt: Date.now(),
    };
    this.store.set(this.k(updated), updated);
    return updated;
  }

  async delete(id: string, tenantId: string): Promise<void> {
    this.store.delete(`${tenantId}::${id}`);
  }
}

// ── Variable scope/type re-exports (consumers may import from this
//    module for convenience, but the canonical source is the runtime
//    package). ─────────────────────────────────────────────────────────

export type { VariableScope, VariableType, VariableVisibility };
