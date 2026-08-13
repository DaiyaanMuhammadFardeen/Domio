/**
 * Prototype-runtime service — business logic (Phase 10 M1 + M2).
 *
 * Wires the seven repositories behind a service facade that
 *   - generates IDs + timestamps
 *   - compiles expressions (for conditional rules)
 *   - enforces uniqueness (variable name, branching edge)
 *   - enforces optimistic locking
 */

import { compileExpression, type CompiledExpression } from '@domio/prototype-runtime';
import type {
  Hotspot,
  Overlay,
  BranchingEdge,
  InteractionState,
  InteractionStateMachineSpec,
  InteractionStateScope,
  Variable,
  VariableBinding,
  ConditionalRule,
  Quiz,
  QuizAttempt,
  QuizAnswer,
  QuizResult,
  LlmReviewQueueItem,
  PresentationSequence,
} from '@domio/prototype-runtime';
import {
  StateMachine,
  EVENT_PRECEDENCE,
  type InteractionEventKind,
} from '@domio/prototype-runtime';

import {
  NotFoundError,
  DuplicateBranchingEdgeError,
  DuplicateVariableNameError,
  VariableValidationError,
  type HotspotRepository,
  type OverlayRepository,
  type BranchingEdgeRepository,
  type InteractionStateRepository,
  type VariableRepository,
  type VariableBindingRepository,
  type ConditionalRuleRepository,
  type QuizRepository,
  type QuizAttemptRepository,
  type QuizAnswerRepository,
  type QuizResultRepository,
  type LlmReviewQueueRepository,
  type PresentationSequenceRepository,
  type HotspotPatch,
  type OverlayPatch,
  type BranchingEdgePatch,
  type VariablePatch,
  type ConditionalRulePatch,
  type QuizPatch,
  type QuizAttemptPatch,
  type PresentationSequencePatch,
} from './dal.js';
import {
  validateCreateVariableBinding,
  validateVariableSemantics,
  type CreateHotspotInput,
  type PatchHotspotInput,
  type CreateOverlayInput,
  type PatchOverlayInput,
  type CreateBranchingEdgeInput,
  type PatchBranchingEdgeInput,
  type CreateVariableInput,
  type PatchVariableInput,
  type CreateVariableBindingInput,
  type CreateConditionalRuleInput,
  type PatchConditionalRuleInput,
  type CreateInteractionStateInput,
  type PatchInteractionStateInput,
  type TransitionInput,
  type CreateQuizInput,
  type PatchQuizInput,
  type QuizAnswerInput,
  type StartAttemptInput,
  type LlmReviewUpdateInput,
  type CreatePresentationSequenceInput,
  type PatchPresentationSequenceInput,
} from './schemas.js';

const ULID_CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function newId(): string {
  let out = '';
  for (let i = 0; i < 26; i++) out += ULID_CHARS[Math.floor(Math.random() * 32)]!;
  return out;
}

// ── Errors ─────────────────────────────────────────────────────────────

export class ExpressionCompileError extends Error {
  readonly code = 'EXPRESSION_COMPILE_ERROR' as const;
  constructor(
    public readonly source: string,
    public readonly reason: string,
  ) {
    super(`Failed to compile expression "${source}": ${reason}`);
    this.name = 'ExpressionCompileError';
  }
}

// ── Service options ─────────────────────────────────────────────────────

export interface PrototypeRuntimeServiceOptions {
  readonly hotspots: HotspotRepository;
  readonly overlays: OverlayRepository;
  readonly branchingEdges: BranchingEdgeRepository;
  readonly interactionStates: InteractionStateRepository;
  readonly variables: VariableRepository;
  readonly variableBindings: VariableBindingRepository;
  readonly conditionalRules: ConditionalRuleRepository;
  readonly quizzes?: QuizRepository;
  readonly quizAttempts?: QuizAttemptRepository;
  readonly quizAnswers?: QuizAnswerRepository;
  readonly quizResults?: QuizResultRepository;
  readonly llmReviewQueue?: LlmReviewQueueRepository;
  readonly presentationSequences?: PresentationSequenceRepository;
  readonly idGenerator?: () => string;
  readonly clock?: () => number;
}

const defaultClock = (): number => Date.now();

// ── Service ─────────────────────────────────────────────────────────────

export class PrototypeRuntimeService {
  private readonly opts: PrototypeRuntimeServiceOptions & {
    readonly idGenerator: () => string;
    readonly clock: () => number;
  };

  constructor(opts: PrototypeRuntimeServiceOptions) {
    this.opts = {
      hotspots: opts.hotspots,
      overlays: opts.overlays,
      branchingEdges: opts.branchingEdges,
      interactionStates: opts.interactionStates,
      variables: opts.variables,
      variableBindings: opts.variableBindings,
      conditionalRules: opts.conditionalRules,
      ...(opts.quizzes !== undefined ? { quizzes: opts.quizzes } : {}),
      ...(opts.quizAttempts !== undefined ? { quizAttempts: opts.quizAttempts } : {}),
      ...(opts.quizAnswers !== undefined ? { quizAnswers: opts.quizAnswers } : {}),
      ...(opts.quizResults !== undefined ? { quizResults: opts.quizResults } : {}),
      ...(opts.llmReviewQueue !== undefined ? { llmReviewQueue: opts.llmReviewQueue } : {}),
      ...(opts.presentationSequences !== undefined
        ? { presentationSequences: opts.presentationSequences }
        : {}),
      idGenerator: opts.idGenerator ?? newId,
      clock: opts.clock ?? defaultClock,
    };
  }

  // ── Hotspots ────────────────────────────────────────────────────────
  async createHotspot(
    tenantId: string,
    deckId: string,
    input: CreateHotspotInput,
  ): Promise<Hotspot> {
    const now = this.opts.clock();
    const record: Hotspot = {
      id: this.opts.idGenerator(),
      tenantId,
      deckId,
      slideId: input.slideId,
      name: input.name,
      geometry: input.geometry as Hotspot['geometry'],
      gestureMask: (input.gestureMask as Hotspot['gestureMask']) ?? ['click'],
      zIndex: input.zIndex ?? 0,
      targetType: input.targetType as Hotspot['targetType'],
      targetRef: input.targetRef as Hotspot['targetRef'],
      status: 'ok',
      version: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.opts.hotspots.insert(record);
    return record;
  }

  async getHotspot(tenantId: string, id: string): Promise<Hotspot> {
    const found = await this.opts.hotspots.findById(id, tenantId);
    if (!found) throw new NotFoundError('Hotspot', id);
    return found;
  }

  async listHotspots(tenantId: string, deckId: string, slideId?: string): Promise<Hotspot[]> {
    return this.opts.hotspots.listByDeck(deckId, tenantId, slideId);
  }

  async patchHotspot(tenantId: string, id: string, input: PatchHotspotInput): Promise<Hotspot> {
    const patch: HotspotPatch = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.geometry !== undefined) patch.geometry = input.geometry as Hotspot['geometry'];
    if (input.gestureMask !== undefined)
      patch.gestureMask = input.gestureMask as Hotspot['gestureMask'];
    if (input.zIndex !== undefined) patch.zIndex = input.zIndex;
    if (input.targetType !== undefined)
      patch.targetType = input.targetType as Hotspot['targetType'];
    if (input.targetRef !== undefined) patch.targetRef = input.targetRef as Hotspot['targetRef'];
    if (input.status !== undefined) patch.status = input.status;
    return this.opts.hotspots.update(id, tenantId, patch, input.version);
  }

  async deleteHotspot(tenantId: string, id: string): Promise<void> {
    await this.opts.hotspots.delete(id, tenantId);
  }

  // ── Overlays ────────────────────────────────────────────────────────
  async createOverlay(
    tenantId: string,
    deckId: string,
    input: CreateOverlayInput,
  ): Promise<Overlay> {
    const now = this.opts.clock();
    const record: Overlay = {
      id: this.opts.idGenerator(),
      tenantId,
      deckId,
      slideId: input.slideId,
      name: input.name,
      type: input.type as Overlay['type'],
      sizeStrategy: input.sizeStrategy as Overlay['sizeStrategy'],
      anchor: (input.anchor as Overlay['anchor']) ?? null,
      openTrigger: (input.openTrigger as Overlay['openTrigger']) ?? null,
      closeTrigger: (input.closeTrigger as Overlay['closeTrigger']) ?? null,
      persistent: input.persistent ?? false,
      schema: (input.schema as Overlay['schema']) ?? {},
      version: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.opts.overlays.insert(record);
    return record;
  }

  async getOverlay(tenantId: string, id: string): Promise<Overlay> {
    const found = await this.opts.overlays.findById(id, tenantId);
    if (!found) throw new NotFoundError('Overlay', id);
    return found;
  }

  async listOverlays(tenantId: string, deckId: string, slideId?: string): Promise<Overlay[]> {
    return this.opts.overlays.listByDeck(deckId, tenantId, slideId);
  }

  async patchOverlay(
    tenantId: string,
    id: string,
    input: PatchOverlayInput,
    raw: Record<string, unknown>,
  ): Promise<Overlay> {
    const patch: OverlayPatch = {};
    if (raw['name'] !== undefined) patch.name = raw['name'] as string;
    if (raw['type'] !== undefined) patch.type = raw['type'] as Overlay['type'];
    if (raw['sizeStrategy'] !== undefined)
      patch.sizeStrategy = raw['sizeStrategy'] as Overlay['sizeStrategy'];
    if (raw['anchor'] !== undefined) patch.anchor = raw['anchor'] as Overlay['anchor'];
    if (raw['openTrigger'] !== undefined)
      patch.openTrigger = raw['openTrigger'] as Overlay['openTrigger'];
    if (raw['closeTrigger'] !== undefined)
      patch.closeTrigger = raw['closeTrigger'] as Overlay['closeTrigger'];
    if (raw['persistent'] !== undefined) patch.persistent = raw['persistent'] as boolean;
    if (raw['schema'] !== undefined) patch.schema = raw['schema'] as Overlay['schema'];
    return this.opts.overlays.update(id, tenantId, patch, input.version);
  }

  async deleteOverlay(tenantId: string, id: string): Promise<void> {
    await this.opts.overlays.delete(id, tenantId);
  }

  // ── Branching edges ─────────────────────────────────────────────────
  async createBranchingEdge(
    tenantId: string,
    deckId: string,
    input: CreateBranchingEdgeInput,
  ): Promise<BranchingEdge> {
    const now = this.opts.clock();
    const record: BranchingEdge = {
      id: this.opts.idGenerator(),
      tenantId,
      deckId,
      fromSlideId: input.fromSlideId,
      toSlideId: input.toSlideId,
      name: input.name,
      ruleId: input.ruleId ?? null,
      priority: input.priority ?? 0,
      createdAt: now,
    };
    await this.opts.branchingEdges.insert(record);
    return record;
  }

  async getBranchingEdge(tenantId: string, id: string): Promise<BranchingEdge> {
    const found = await this.opts.branchingEdges.findById(id, tenantId);
    if (!found) throw new NotFoundError('BranchingEdge', id);
    return found;
  }

  async listBranchingEdges(tenantId: string, deckId: string): Promise<BranchingEdge[]> {
    return this.opts.branchingEdges.listByDeck(deckId, tenantId);
  }

  async patchBranchingEdge(
    tenantId: string,
    id: string,
    input: PatchBranchingEdgeInput,
  ): Promise<BranchingEdge> {
    const patch: BranchingEdgePatch = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.toSlideId !== undefined) patch.toSlideId = input.toSlideId;
    if (input.ruleId !== undefined) patch.ruleId = input.ruleId;
    if (input.priority !== undefined) patch.priority = input.priority;
    return this.opts.branchingEdges.update(id, tenantId, patch);
  }

  async deleteBranchingEdge(tenantId: string, id: string): Promise<void> {
    await this.opts.branchingEdges.delete(id, tenantId);
  }

  // ── Interaction states ──────────────────────────────────────────────
  async createInteractionState(
    tenantId: string,
    deckId: string,
    input: CreateInteractionStateInput,
  ): Promise<InteractionState> {
    const now = this.opts.clock();
    const record: InteractionState = {
      id: this.opts.idGenerator(),
      tenantId,
      deckId,
      instanceId: input.instanceId,
      stateMachine: input.stateMachine as InteractionStateMachineSpec,
      currentState: input.currentState,
      scope: input.scope as InteractionStateScope,
      persistInstanceState: input.persistInstanceState ?? false,
      updatedAt: now,
    };
    await this.opts.interactionStates.insert(record);
    return record;
  }

  async getInteractionState(tenantId: string, id: string): Promise<InteractionState> {
    const found = await this.opts.interactionStates.findById(id, tenantId);
    if (!found) throw new NotFoundError('InteractionState', id);
    return found;
  }

  async listInteractionStates(tenantId: string, deckId: string): Promise<InteractionState[]> {
    return this.opts.interactionStates.listByDeck(deckId, tenantId);
  }

  async patchInteractionState(
    tenantId: string,
    id: string,
    input: PatchInteractionStateInput,
  ): Promise<InteractionState> {
    type WritablePatch = { -readonly [K in keyof InteractionState]: InteractionState[K] };
    const patch: Partial<WritablePatch> = {};
    if (input.currentState !== undefined) patch.currentState = input.currentState;
    if (input.scope !== undefined) patch.scope = input.scope as InteractionStateScope;
    if (input.persistInstanceState !== undefined)
      patch.persistInstanceState = input.persistInstanceState;
    if (input.stateMachine !== undefined)
      patch.stateMachine = input.stateMachine as InteractionStateMachineSpec;
    return this.opts.interactionStates.update(id, tenantId, patch);
  }

  /**
   * Apply a transition event to a stored state machine. Returns the new
   * record + a `transition` metadata block (previous / current / event /
   * changed). The runtime `StateMachine` is used as the source of truth
   * for the transition logic.
   */
  async transitionInteractionState(
    tenantId: string,
    id: string,
    input: TransitionInput,
  ): Promise<{
    record: InteractionState;
    transition: {
      previous: string;
      current: string;
      event: string;
      changed: boolean;
      at: number;
      precedence: number;
    };
  }> {
    const existing = await this.getInteractionState(tenantId, id);
    const machine = new StateMachine(existing.instanceId, existing.stateMachine, {
      currentState: existing.currentState,
      now: this.opts.clock,
    });
    const result = machine.transition(input.event as InteractionEventKind);
    const updated = await this.opts.interactionStates.update(id, tenantId, {
      currentState: result.current,
    });
    return {
      record: updated,
      transition: {
        previous: result.previous,
        current: result.current,
        event: input.event,
        changed: result.changed,
        at: result.at,
        precedence: EVENT_PRECEDENCE[input.event as InteractionEventKind] ?? 0,
      },
    };
  }

  async deleteInteractionState(tenantId: string, id: string): Promise<void> {
    await this.opts.interactionStates.delete(id, tenantId);
  }

  // ── Variables ───────────────────────────────────────────────────────
  async createVariable(
    tenantId: string,
    deckId: string,
    input: CreateVariableInput,
  ): Promise<Variable> {
    validateVariableSemantics({
      type: input.type,
      ...(input.enumValues !== undefined ? { enumValues: input.enumValues } : {}),
      ...(input.min !== undefined ? { min: input.min } : {}),
      ...(input.max !== undefined ? { max: input.max } : {}),
    });
    const now = this.opts.clock();
    const record: Variable = {
      id: this.opts.idGenerator(),
      tenantId,
      deckId,
      name: input.name,
      scope: input.scope as Variable['scope'],
      type: input.type as Variable['type'],
      ...(input.enumValues !== undefined ? { enumValues: input.enumValues } : {}),
      ...(input.min !== undefined ? { min: input.min } : {}),
      ...(input.max !== undefined ? { max: input.max } : {}),
      defaultValue: input.defaultValue,
      visibility: (input.visibility as Variable['visibility']) ?? 'deck_public',
      readOnly: input.readOnly ?? false,
      version: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.opts.variables.insert(record);
    return record;
  }

  async getVariable(tenantId: string, id: string): Promise<Variable> {
    const found = await this.opts.variables.findById(id, tenantId);
    if (!found) throw new NotFoundError('Variable', id);
    return found;
  }

  async listVariables(tenantId: string, deckId: string): Promise<Variable[]> {
    return this.opts.variables.listByDeck(deckId, tenantId);
  }

  async patchVariable(
    tenantId: string,
    id: string,
    input: PatchVariableInput,
    raw: Record<string, unknown>,
  ): Promise<Variable> {
    const patch: VariablePatch = {};
    if (raw['scope'] !== undefined) patch.scope = raw['scope'] as Variable['scope'];
    if (raw['enumValues'] !== undefined) patch.enumValues = raw['enumValues'] as readonly string[];
    if (raw['min'] !== undefined) patch.min = raw['min'] as number;
    if (raw['max'] !== undefined) patch.max = raw['max'] as number;
    if (raw['defaultValue'] !== undefined) patch.defaultValue = raw['defaultValue'];
    if (raw['visibility'] !== undefined)
      patch.visibility = raw['visibility'] as Variable['visibility'];
    if (raw['readOnly'] !== undefined) patch.readOnly = raw['readOnly'] as boolean;

    validateVariableSemantics({
      ...(typeof raw['type'] === 'string' ? { type: raw['type'] } : {}),
      ...(patch.enumValues !== undefined ? { enumValues: patch.enumValues } : {}),
      ...(patch.min !== undefined ? { min: patch.min } : {}),
      ...(patch.max !== undefined ? { max: patch.max } : {}),
    });
    return this.opts.variables.update(id, tenantId, patch, input.version);
  }

  async deleteVariable(tenantId: string, id: string): Promise<void> {
    await this.opts.variables.delete(id, tenantId);
  }

  // ── Variable bindings ───────────────────────────────────────────────
  async createVariableBinding(
    tenantId: string,
    deckId: string,
    input: CreateVariableBindingInput,
    raw: unknown,
  ): Promise<VariableBinding> {
    validateCreateVariableBinding(raw); // round-trip validation; throws via returned errors at handler level
    const now = this.opts.clock();
    const record: VariableBinding = {
      id: this.opts.idGenerator(),
      tenantId,
      deckId,
      variableId: input.variableId,
      targetKind: input.targetKind as VariableBinding['targetKind'],
      targetId: input.targetId,
      targetProp: input.targetProp,
      ...(input.transform !== undefined ? { transform: input.transform } : {}),
      version: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.opts.variableBindings.insert(record);
    return record;
  }

  async listVariableBindings(tenantId: string, deckId: string): Promise<VariableBinding[]> {
    return this.opts.variableBindings.listByDeck(deckId, tenantId);
  }

  async deleteVariableBinding(tenantId: string, id: string): Promise<void> {
    await this.opts.variableBindings.delete(id, tenantId);
  }

  // ── Conditional rules ───────────────────────────────────────────────
  async createConditionalRule(
    tenantId: string,
    deckId: string,
    input: CreateConditionalRuleInput,
  ): Promise<ConditionalRule> {
    const compiled = this.compileOrThrow(input.conditionSource);
    const now = this.opts.clock();
    const record: ConditionalRule = {
      id: this.opts.idGenerator(),
      tenantId,
      deckId,
      name: input.name,
      priority: input.priority ?? 0,
      condition: compiled.ast,
      conditionSource: input.conditionSource,
      scopeSlideId: input.scopeSlideId ?? null,
      action: input.action as ConditionalRule['action'],
      enabled: input.enabled ?? true,
      version: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.opts.conditionalRules.insert(record);
    return record;
  }

  async getConditionalRule(tenantId: string, id: string): Promise<ConditionalRule> {
    const found = await this.opts.conditionalRules.findById(id, tenantId);
    if (!found) throw new NotFoundError('ConditionalRule', id);
    return found;
  }

  async listConditionalRules(tenantId: string, deckId: string): Promise<ConditionalRule[]> {
    return this.opts.conditionalRules.listByDeck(deckId, tenantId);
  }

  async patchConditionalRule(
    tenantId: string,
    id: string,
    input: PatchConditionalRuleInput,
    raw: Record<string, unknown>,
  ): Promise<ConditionalRule> {
    const patch: ConditionalRulePatch = {};
    if (raw['name'] !== undefined) patch.name = raw['name'] as string;
    if (raw['priority'] !== undefined) patch.priority = raw['priority'] as number;
    if (raw['conditionSource'] !== undefined) {
      const compiled = this.compileOrThrow(raw['conditionSource'] as string);
      patch.condition = compiled.ast;
      patch.conditionSource = raw['conditionSource'] as string;
    }
    if (raw['scopeSlideId'] !== undefined)
      patch.scopeSlideId = raw['scopeSlideId'] as string | null;
    if (raw['action'] !== undefined) patch.action = raw['action'] as ConditionalRule['action'];
    if (raw['enabled'] !== undefined) patch.enabled = raw['enabled'] as boolean;
    return this.opts.conditionalRules.update(id, tenantId, patch, input.version);
  }

  async deleteConditionalRule(tenantId: string, id: string): Promise<void> {
    await this.opts.conditionalRules.delete(id, tenantId);
  }

  // ── Quizzes (M6.1) ──────────────────────────────────────────────────
  async createQuiz(tenantId: string, deckId: string, input: CreateQuizInput): Promise<Quiz> {
    const now = this.opts.clock();
    const record: Quiz = {
      id: this.opts.idGenerator(),
      tenantId,
      deckId,
      name: input.name,
      questions: input.questions as Quiz['questions'],
      ...(input.passThreshold !== undefined ? { passThreshold: input.passThreshold } : {}),
      version: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.requireQuizRepo().insert(record);
    return record;
  }

  async getQuiz(tenantId: string, id: string): Promise<Quiz> {
    const found = await this.requireQuizRepo().findById(id, tenantId);
    if (!found) throw new NotFoundError('Quiz', id);
    return found;
  }

  async listQuizzes(tenantId: string, deckId: string): Promise<Quiz[]> {
    return this.requireQuizRepo().listByDeck(deckId, tenantId);
  }

  async patchQuiz(tenantId: string, id: string, input: PatchQuizInput): Promise<Quiz> {
    const patch: QuizPatch = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.questions !== undefined) patch.questions = input.questions as Quiz['questions'];
    if (input.passThreshold !== undefined) patch.passThreshold = input.passThreshold;
    return this.requireQuizRepo().update(id, tenantId, patch, input.version);
  }

  async deleteQuiz(tenantId: string, id: string): Promise<void> {
    await this.requireQuizRepo().delete(id, tenantId);
  }

  async startAttempt(
    tenantId: string,
    deckId: string,
    quizId: string,
    input: StartAttemptInput,
  ): Promise<QuizAttempt> {
    const record: QuizAttempt = {
      id: this.opts.idGenerator(),
      tenantId,
      deckId,
      quizId,
      seed: input.seed ?? this.opts.idGenerator(),
      viewerId: input.viewerId,
      startedAt: this.opts.clock(),
      completedAt: null,
      status: 'in_progress',
      currentQuestionId: null,
      score: 0,
      passed: null,
    };
    await this.requireAttemptRepo().insert(record);
    return record;
  }

  async submitAnswer(
    tenantId: string,
    attemptId: string,
    answer: QuizAnswerInput,
  ): Promise<QuizAnswer> {
    const attempt = await this.requireAttemptRepo().findById(attemptId, tenantId);
    if (!attempt) throw new NotFoundError('QuizAttempt', attemptId);
    if (attempt.completedAt !== null) {
      throw new Error('attempt already completed');
    }
    const record: QuizAnswer = {
      id: this.opts.idGenerator(),
      tenantId,
      attemptId,
      questionId: answer.questionId,
      value: answer.value,
      correct: answer.correct,
      score: answer.score,
      ...(answer.confidence !== undefined ? { confidence: answer.confidence } : {}),
      needsHumanReview: answer.needsHumanReview === true,
      submittedAt: this.opts.clock(),
    };
    await this.requireAnswerRepo().insert(record);

    if (answer.needsHumanReview) {
      const queue = this.opts.llmReviewQueue;
      if (queue) {
        const item: LlmReviewQueueItem = {
          id: this.opts.idGenerator(),
          tenantId,
          deckId: attempt.deckId,
          quizId: attempt.quizId,
          attemptId,
          questionId: answer.questionId,
          submittedAnswer: String(answer.value ?? ''),
          llmConfidence: answer.confidence ?? 0,
          llmReason: answer.llmReason ?? '',
          status: 'pending',
          reviewerId: null,
          overrideScore: null,
          createdAt: this.opts.clock(),
          updatedAt: this.opts.clock(),
        };
        await queue.insert(item);
      }
    }

    const patch: QuizAttemptPatch = {
      currentQuestionId: answer.questionId,
      score: attempt.score + answer.score,
    };
    await this.requireAttemptRepo().update(attemptId, tenantId, patch);
    return record;
  }

  async completeAttempt(tenantId: string, attemptId: string): Promise<QuizResult> {
    const attempt = await this.requireAttemptRepo().findById(attemptId, tenantId);
    if (!attempt) throw new NotFoundError('QuizAttempt', attemptId);
    const answers = await this.requireAnswerRepo().listByAttempt(attemptId, tenantId);
    const totalScore = answers.reduce((s, a) => s + a.score, 0);
    const now = this.opts.clock();
    const passed = answers.length > 0 && answers.every((a) => a.correct) && totalScore > 0;
    await this.requireAttemptRepo().update(attemptId, tenantId, {
      completedAt: now,
      status: 'completed',
      passed,
      score: totalScore,
    });
    const result: QuizResult = {
      id: this.opts.idGenerator(),
      tenantId,
      attemptId,
      quizId: attempt.quizId,
      totalScore,
      maxScore: 0,
      percentage: 0,
      passed,
      answers,
      completedAt: now,
    };
    await this.requireResultRepo().insert(result);
    return result;
  }

  async getAttemptResult(tenantId: string, attemptId: string): Promise<QuizResult> {
    const found = await this.requireResultRepo().findByAttempt(attemptId, tenantId);
    if (!found) throw new NotFoundError('QuizResult', attemptId);
    return found;
  }

  async listLlmReviewQueue(
    tenantId: string,
    status?: LlmReviewQueueItem['status'],
  ): Promise<LlmReviewQueueItem[]> {
    if (!this.opts.llmReviewQueue) return [];
    return this.opts.llmReviewQueue.listByTenant(tenantId, status);
  }

  async updateLlmReviewItem(
    tenantId: string,
    id: string,
    patch: LlmReviewUpdateInput,
  ): Promise<LlmReviewQueueItem> {
    if (!this.opts.llmReviewQueue) throw new NotFoundError('LlmReviewQueueItem', id);
    return this.opts.llmReviewQueue.update(id, tenantId, patch);
  }

  // ── Presentation sequences (M6.2) ──────────────────────────────────
  async createPresentationSequence(
    tenantId: string,
    deckId: string,
    input: CreatePresentationSequenceInput,
  ): Promise<PresentationSequence> {
    const now = this.opts.clock();
    const record: PresentationSequence = {
      id: this.opts.idGenerator(),
      tenantId,
      deckId,
      name: input.name,
      slides: input.slides as readonly string[],
      intervalMs: input.intervalMs,
      pauseOnEvent: input.pauseOnEvent ?? false,
      loop: input.loop ?? false,
      count: input.count ?? 1,
      interruptionPolicy: input.interruptionPolicy as PresentationSequence['interruptionPolicy'],
      reducedMotionDefaultOff: input.reducedMotionDefaultOff ?? true,
      pauseWarnAtMs: input.pauseWarnAtMs ?? 1_800_000,
      version: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.requireSequenceRepo().insert(record);
    return record;
  }

  async getPresentationSequence(tenantId: string, id: string): Promise<PresentationSequence> {
    const found = await this.requireSequenceRepo().findById(id, tenantId);
    if (!found) throw new NotFoundError('PresentationSequence', id);
    return found;
  }

  async listPresentationSequences(
    tenantId: string,
    deckId: string,
  ): Promise<PresentationSequence[]> {
    return this.requireSequenceRepo().listByDeck(deckId, tenantId);
  }

  async patchPresentationSequence(
    tenantId: string,
    id: string,
    input: PatchPresentationSequenceInput,
  ): Promise<PresentationSequence> {
    const patch: PresentationSequencePatch = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.slides !== undefined) patch.slides = input.slides;
    if (input.intervalMs !== undefined) patch.intervalMs = input.intervalMs;
    if (input.pauseOnEvent !== undefined) patch.pauseOnEvent = input.pauseOnEvent;
    if (input.loop !== undefined) patch.loop = input.loop;
    if (input.count !== undefined) patch.count = input.count;
    if (input.interruptionPolicy !== undefined) {
      patch.interruptionPolicy =
        input.interruptionPolicy as PresentationSequence['interruptionPolicy'];
    }
    if (input.reducedMotionDefaultOff !== undefined) {
      patch.reducedMotionDefaultOff = input.reducedMotionDefaultOff;
    }
    if (input.pauseWarnAtMs !== undefined) patch.pauseWarnAtMs = input.pauseWarnAtMs;
    return this.requireSequenceRepo().update(id, tenantId, patch, input.version);
  }

  async deletePresentationSequence(tenantId: string, id: string): Promise<void> {
    await this.requireSequenceRepo().delete(id, tenantId);
  }

  // ── Helpers ─────────────────────────────────────────────────────────
  private compileOrThrow(source: string): CompiledExpression {
    try {
      return compileExpression(source);
    } catch (e) {
      throw new ExpressionCompileError(source, e instanceof Error ? e.message : String(e));
    }
  }

  private requireQuizRepo(): QuizRepository {
    if (!this.opts.quizzes) {
      throw new NotFoundError('QuizRepository', 'unconfigured');
    }
    return this.opts.quizzes;
  }

  private requireAttemptRepo(): QuizAttemptRepository {
    if (!this.opts.quizAttempts) {
      throw new NotFoundError('QuizAttemptRepository', 'unconfigured');
    }
    return this.opts.quizAttempts;
  }

  private requireAnswerRepo(): QuizAnswerRepository {
    if (!this.opts.quizAnswers) {
      throw new NotFoundError('QuizAnswerRepository', 'unconfigured');
    }
    return this.opts.quizAnswers;
  }

  private requireResultRepo(): QuizResultRepository {
    if (!this.opts.quizResults) {
      throw new NotFoundError('QuizResultRepository', 'unconfigured');
    }
    return this.opts.quizResults;
  }

  private requireSequenceRepo(): PresentationSequenceRepository {
    if (!this.opts.presentationSequences) {
      throw new NotFoundError('PresentationSequenceRepository', 'unconfigured');
    }
    return this.opts.presentationSequences;
  }
}

// Suppress unused-import noise from the types-only imports that exist to
// keep the API surface discoverable via the IDE.
void NotFoundError;
void DuplicateBranchingEdgeError;
void DuplicateVariableNameError;
void VariableValidationError;
