/**
 * Prototype-runtime service — request body schemas (Phase 10 M1 + M2 + M3).
 *
 * Validates incoming request bodies without dragging in a schema engine.
 * Each validator returns either `{ valid: true, value }` (normalized) or
 * `{ valid: false, errors }` (stable error list).
 */

import { VariableValidationError } from './dal.js';

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const VAR_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

const ALLOWED_SCOPES = ['deck', 'slide', 'component_instance', 'session', 'viewer'] as const;
const ALLOWED_TYPES = ['string', 'number', 'boolean', 'enum', 'json', 'array'] as const;
const ALLOWED_VISIBILITIES = ['deck_public', 'private', 'server_only'] as const;
const ALLOWED_GESTURES = ['click', 'double_click', 'long_press', 'hover', 'focus'] as const;
const ALLOWED_HOTSPOT_TARGET_TYPES = ['slide', 'url', 'overlay', 'action'] as const;
const ALLOWED_OVERLAY_TYPES = ['modal', 'tooltip', 'drawer', 'popover', 'sheet'] as const;
const ALLOWED_OVERLAY_SIZES = ['small', 'medium', 'large', 'fullscreen', 'auto'] as const;
const ALLOWED_BINDING_TARGETS = [
  'element_prop',
  'slide_prop',
  'deck_prop',
  'overlay_open',
  'hotspot_target',
] as const;
const ALLOWED_ACTIONS = [
  'show',
  'hide',
  'enable',
  'disable',
  'set_variable',
  'navigate_to',
  'play_animation',
  'submit_form',
  'open_overlay',
  'close_overlay',
] as const;
const ALLOWED_STATE_SCOPES = ['session', 'slide', 'deck', 'persistent_session'] as const;
const ALLOWED_STATE_EVENTS = ['focus', 'press', 'click', 'hover', 'default'] as const;
const ALLOWED_INTERRUPTION_POLICIES = ['ignore', 'queue', 'abort'] as const;
const ALLOWED_QUESTION_TYPES = [
  'multiple_choice',
  'multi_select',
  'true_false',
  'short_answer',
  'fill_blank',
  'drag_to_match',
  'hotspot_quiz',
  'flash_card',
  'short_answer_llm',
] as const;

export interface ValidationError {
  readonly path: string;
  readonly message: string;
}

export interface ValidationResult<T> {
  readonly valid: boolean;
  readonly value?: T;
  readonly errors: readonly ValidationError[];
}

function ok<T>(value: T): ValidationResult<T> {
  return { valid: true, value, errors: [] };
}
function fail(errors: ValidationError[]): ValidationResult<never> {
  return { valid: false, errors };
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}
function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}
function inSet<T extends string>(set: readonly T[], v: unknown): v is T {
  return typeof v === 'string' && (set as readonly string[]).includes(v);
}

// ── Hotspot ─────────────────────────────────────────────────────────────

export interface CreateHotspotInput {
  readonly slideId: string;
  readonly name: string;
  readonly geometry: unknown;
  readonly gestureMask?: readonly string[];
  readonly zIndex?: number;
  readonly targetType: string;
  readonly targetRef: unknown;
}

export function validateCreateHotspot(body: unknown): ValidationResult<CreateHotspotInput> {
  if (!isObject(body)) return fail([{ path: '', message: 'Body must be an object' }]);
  const errors: ValidationError[] = [];
  const { slideId, name, geometry, targetType, targetRef } = body;
  if (!isString(slideId) || !ULID.test(slideId))
    errors.push({ path: 'slideId', message: 'must be a ULID' });
  if (!isString(name) || name.length < 1 || name.length > 128)
    errors.push({ path: 'name', message: '1..128 chars required' });
  if (!isObject(geometry)) errors.push({ path: 'geometry', message: 'must be an object' });
  if (!inSet(ALLOWED_HOTSPOT_TARGET_TYPES, targetType))
    errors.push({ path: 'targetType', message: 'invalid targetType' });
  if (!isObject(targetRef)) errors.push({ path: 'targetRef', message: 'must be an object' });

  const gestureMask = (body as { gestureMask?: unknown }).gestureMask;
  if (gestureMask !== undefined) {
    if (!isArray(gestureMask) || gestureMask.length < 1) {
      errors.push({ path: 'gestureMask', message: 'array required' });
    } else if (!gestureMask.every((g) => inSet(ALLOWED_GESTURES, g))) {
      errors.push({ path: 'gestureMask', message: 'unknown gesture value' });
    }
  }

  const zIndex = (body as { zIndex?: unknown }).zIndex;
  if (zIndex !== undefined && (!isNumber(zIndex) || zIndex < 0 || zIndex > 1000)) {
    errors.push({ path: 'zIndex', message: 'integer 0..1000' });
  }

  if (errors.length) return fail(errors);
  return ok({
    slideId: slideId as string,
    name: name as string,
    geometry: geometry as unknown,
    gestureMask: (gestureMask as readonly string[] | undefined) ?? ['click'],
    zIndex: (zIndex as number | undefined) ?? 0,
    targetType: targetType as string,
    targetRef: targetRef as unknown,
  });
}

export interface PatchHotspotInput {
  readonly version: number;
  readonly name?: string;
  readonly geometry?: unknown;
  readonly gestureMask?: readonly string[];
  readonly zIndex?: number;
  readonly targetType?: string;
  readonly targetRef?: unknown;
  readonly status?: 'ok' | 'dangling';
}

export function validatePatchHotspot(body: unknown): ValidationResult<PatchHotspotInput> {
  if (!isObject(body)) return fail([{ path: '', message: 'Body must be an object' }]);
  const errors: ValidationError[] = [];
  const { version } = body;
  if (!isNumber(version) || version < 0)
    errors.push({ path: 'version', message: 'non-negative integer required' });
  if (errors.length) return fail(errors);
  return ok({ version, ...(body as Record<string, unknown>) } as PatchHotspotInput);
}

// ── Overlay ─────────────────────────────────────────────────────────────

export interface CreateOverlayInput {
  readonly slideId: string;
  readonly name: string;
  readonly type: string;
  readonly sizeStrategy: string;
  readonly anchor?: unknown;
  readonly openTrigger?: unknown;
  readonly closeTrigger?: unknown;
  readonly persistent?: boolean;
  readonly schema: unknown;
}

export function validateCreateOverlay(body: unknown): ValidationResult<CreateOverlayInput> {
  if (!isObject(body)) return fail([{ path: '', message: 'Body must be an object' }]);
  const errors: ValidationError[] = [];
  const { slideId, name, type, sizeStrategy, schema } = body;
  if (!isString(slideId) || !ULID.test(slideId))
    errors.push({ path: 'slideId', message: 'must be a ULID' });
  if (!isString(name) || name.length < 1) errors.push({ path: 'name', message: 'required' });
  if (!inSet(ALLOWED_OVERLAY_TYPES, type)) errors.push({ path: 'type', message: 'invalid type' });
  if (!inSet(ALLOWED_OVERLAY_SIZES, sizeStrategy))
    errors.push({ path: 'sizeStrategy', message: 'invalid sizeStrategy' });
  if (!isObject(schema)) errors.push({ path: 'schema', message: 'must be an object' });

  if (errors.length) return fail(errors);
  return ok({ ...(body as unknown as CreateOverlayInput) });
}

export interface PatchOverlayInput {
  readonly version: number;
}
export function validatePatchOverlay(body: unknown): ValidationResult<PatchOverlayInput> {
  if (!isObject(body)) return fail([{ path: '', message: 'Body must be an object' }]);
  const errors: ValidationError[] = [];
  const { version } = body;
  if (!isNumber(version) || version < 0)
    errors.push({ path: 'version', message: 'non-negative integer required' });
  if (errors.length) return fail(errors);
  return ok({ version: version as number });
}

// ── Branching edge ──────────────────────────────────────────────────────

export interface CreateBranchingEdgeInput {
  readonly fromSlideId: string;
  readonly toSlideId: string;
  readonly name: string;
  readonly ruleId?: string | null;
  readonly priority?: number;
}

export function validateCreateBranchingEdge(
  body: unknown,
): ValidationResult<CreateBranchingEdgeInput> {
  if (!isObject(body)) return fail([{ path: '', message: 'Body must be an object' }]);
  const errors: ValidationError[] = [];
  const { fromSlideId, toSlideId, name } = body;
  if (!isString(fromSlideId) || !ULID.test(fromSlideId))
    errors.push({ path: 'fromSlideId', message: 'must be a ULID' });
  if (!isString(toSlideId) || !ULID.test(toSlideId))
    errors.push({ path: 'toSlideId', message: 'must be a ULID' });
  if (fromSlideId === toSlideId)
    errors.push({ path: 'toSlideId', message: 'self-loops not allowed' });
  if (!isString(name) || name.length < 1) errors.push({ path: 'name', message: 'required' });

  const ruleId = (body as { ruleId?: unknown }).ruleId;
  if (ruleId !== undefined && ruleId !== null && (!isString(ruleId) || !ULID.test(ruleId))) {
    errors.push({ path: 'ruleId', message: 'must be ULID or null' });
  }
  const priority = (body as { priority?: unknown }).priority;
  if (priority !== undefined && (!isNumber(priority) || priority < -10000 || priority > 10000)) {
    errors.push({ path: 'priority', message: '-10000..10000' });
  }

  if (errors.length) return fail(errors);
  return ok({ ...(body as unknown as CreateBranchingEdgeInput) });
}

export interface PatchBranchingEdgeInput {
  readonly name?: string;
  readonly toSlideId?: string;
  readonly ruleId?: string | null;
  readonly priority?: number;
}
export function validatePatchBranchingEdge(
  body: unknown,
): ValidationResult<PatchBranchingEdgeInput> {
  if (!isObject(body)) return fail([{ path: '', message: 'Body must be an object' }]);
  return ok({ ...(body as Record<string, unknown>) } as PatchBranchingEdgeInput);
}

// ── Variable ────────────────────────────────────────────────────────────

export interface CreateVariableInput {
  readonly name: string;
  readonly scope: string;
  readonly type: string;
  readonly enumValues?: readonly string[];
  readonly min?: number;
  readonly max?: number;
  readonly defaultValue: unknown;
  readonly visibility?: string;
  readonly readOnly?: boolean;
}

export function validateCreateVariable(body: unknown): ValidationResult<CreateVariableInput> {
  if (!isObject(body)) return fail([{ path: '', message: 'Body must be an object' }]);
  const errors: ValidationError[] = [];
  const { name, scope, type } = body;
  if (!isString(name) || !VAR_NAME.test(name))
    errors.push({ path: 'name', message: 'must match ^[A-Za-z_][A-Za-z0-9_]{0,63}$' });
  if (!inSet(ALLOWED_SCOPES, scope)) errors.push({ path: 'scope', message: 'invalid scope' });
  if (!inSet(ALLOWED_TYPES, type)) errors.push({ path: 'type', message: 'invalid type' });

  if (errors.length) return fail(errors);
  return ok({ ...(body as unknown as CreateVariableInput) });
}

export interface PatchVariableInput {
  readonly version: number;
}
export function validatePatchVariable(body: unknown): ValidationResult<PatchVariableInput> {
  if (!isObject(body)) return fail([{ path: '', message: 'Body must be an object' }]);
  const errors: ValidationError[] = [];
  const { version } = body;
  if (!isNumber(version) || version < 0)
    errors.push({ path: 'version', message: 'non-negative integer required' });
  if (errors.length) return fail(errors);
  return ok({ version: version as number });
}

/** Domain-level validation for variable patches (numeric range, enum). */
export function validateVariableSemantics(patch: {
  type?: string;
  enumValues?: readonly string[];
  min?: number;
  max?: number;
}): void {
  if (patch.type === 'enum' && (!patch.enumValues || patch.enumValues.length === 0)) {
    throw new VariableValidationError('enum type requires non-empty enumValues');
  }
  if (patch.min !== undefined && patch.max !== undefined && patch.min > patch.max) {
    throw new VariableValidationError('min > max');
  }
  if (
    patch.type !== 'number' &&
    patch.type !== 'enum' &&
    (patch.min !== undefined || patch.max !== undefined)
  ) {
    throw new VariableValidationError('min/max only allowed for number/enum');
  }
}

// ── Variable binding ────────────────────────────────────────────────────

export interface CreateVariableBindingInput {
  readonly variableId: string;
  readonly targetKind: string;
  readonly targetId: string;
  readonly targetProp: string;
  readonly transform?: string;
}

export function validateCreateVariableBinding(
  body: unknown,
): ValidationResult<CreateVariableBindingInput> {
  if (!isObject(body)) return fail([{ path: '', message: 'Body must be an object' }]);
  const errors: ValidationError[] = [];
  const { variableId, targetKind, targetId, targetProp, transform } = body;
  if (!isString(variableId) || !ULID.test(variableId))
    errors.push({ path: 'variableId', message: 'must be ULID' });
  if (!inSet(ALLOWED_BINDING_TARGETS, targetKind))
    errors.push({ path: 'targetKind', message: 'invalid targetKind' });
  if (!isString(targetId) || !ULID.test(targetId))
    errors.push({ path: 'targetId', message: 'must be ULID' });
  if (!isString(targetProp) || targetProp.length < 1)
    errors.push({ path: 'targetProp', message: 'required' });
  if (transform !== undefined && (!isString(transform) || transform.length > 4096)) {
    errors.push({ path: 'transform', message: 'string up to 4096 chars' });
  }

  if (errors.length) return fail(errors);
  return ok({ ...(body as unknown as CreateVariableBindingInput) });
}

// ── Conditional rule ────────────────────────────────────────────────────

export interface CreateConditionalRuleInput {
  readonly name: string;
  readonly priority?: number;
  readonly conditionSource: string;
  readonly scopeSlideId?: string | null;
  readonly action: { kind: string; params: unknown };
  readonly enabled?: boolean;
}

export function validateCreateConditionalRule(
  body: unknown,
): ValidationResult<CreateConditionalRuleInput> {
  if (!isObject(body)) return fail([{ path: '', message: 'Body must be an object' }]);
  const errors: ValidationError[] = [];
  const { name, conditionSource, action } = body;
  if (!isString(name) || name.length < 1) errors.push({ path: 'name', message: 'required' });
  if (!isString(conditionSource) || conditionSource.length > 4096) {
    errors.push({ path: 'conditionSource', message: 'string up to 4096 chars' });
  }
  if (!isObject(action)) errors.push({ path: 'action', message: 'must be an object' });
  else {
    const a = action as { kind?: unknown; params?: unknown };
    if (!inSet(ALLOWED_ACTIONS, a.kind))
      errors.push({ path: 'action.kind', message: 'invalid kind' });
    if (!isObject(a.params)) errors.push({ path: 'action.params', message: 'must be an object' });
  }

  if (errors.length) return fail(errors);
  return ok({ ...(body as unknown as CreateConditionalRuleInput) });
}

export interface PatchConditionalRuleInput {
  readonly version: number;
}
export function validatePatchConditionalRule(
  body: unknown,
): ValidationResult<PatchConditionalRuleInput> {
  if (!isObject(body)) return fail([{ path: '', message: 'Body must be an object' }]);
  const errors: ValidationError[] = [];
  const { version } = body;
  if (!isNumber(version) || version < 0)
    errors.push({ path: 'version', message: 'non-negative integer required' });
  if (errors.length) return fail(errors);
  return ok({ version: version as number });
}

export const __validationConstants = {
  ALLOWED_SCOPES,
  ALLOWED_TYPES,
  ALLOWED_VISIBILITIES,
  ALLOWED_GESTURES,
  ALLOWED_HOTSPOT_TARGET_TYPES,
  ALLOWED_OVERLAY_TYPES,
  ALLOWED_OVERLAY_SIZES,
  ALLOWED_BINDING_TARGETS,
  ALLOWED_ACTIONS,
  ALLOWED_STATE_SCOPES,
  ALLOWED_STATE_EVENTS,
  ALLOWED_INTERRUPTION_POLICIES,
  ALLOWED_QUESTION_TYPES,
  ULID,
  VAR_NAME,
};

const _exhaustive: never = undefined as never;
export const _ = _exhaustive;

// ── Interaction state (P10 M3) ─────────────────────────────────────────

/** Subset of `InteractionStateMachineSpec` accepted on create. */
export interface StateMachineInput {
  readonly states: Readonly<Record<string, unknown>>;
  readonly initial: string;
  readonly transitions: ReadonlyArray<{
    readonly from: string;
    readonly to: string;
    readonly event: string;
    readonly guard?: string;
  }>;
}

export interface CreateInteractionStateInput {
  readonly instanceId: string;
  readonly stateMachine: StateMachineInput;
  readonly currentState: string;
  readonly scope: string;
  readonly persistInstanceState?: boolean;
}

export function validateCreateInteractionState(
  body: unknown,
): ValidationResult<CreateInteractionStateInput> {
  if (!isObject(body)) return fail([{ path: '', message: 'Body must be an object' }]);
  const errors: ValidationError[] = [];
  const { instanceId, stateMachine, currentState, scope } = body;
  if (!isString(instanceId) || instanceId.length < 1 || instanceId.length > 128) {
    errors.push({ path: 'instanceId', message: '1..128 chars required' });
  }
  if (!isString(currentState) || currentState.length < 1) {
    errors.push({ path: 'currentState', message: 'required' });
  }
  if (!inSet(ALLOWED_STATE_SCOPES, scope)) {
    errors.push({ path: 'scope', message: 'invalid scope' });
  }
  const persistInstanceState = (body as { persistInstanceState?: unknown }).persistInstanceState;
  if (persistInstanceState !== undefined && typeof persistInstanceState !== 'boolean') {
    errors.push({ path: 'persistInstanceState', message: 'boolean required' });
  }

  // Validate stateMachine shape
  if (!isObject(stateMachine)) {
    errors.push({ path: 'stateMachine', message: 'must be an object' });
  } else {
    const sm = stateMachine as { states?: unknown; initial?: unknown; transitions?: unknown };
    if (!isObject(sm.states)) {
      errors.push({ path: 'stateMachine.states', message: 'must be an object' });
    } else {
      const names = Object.keys(sm.states as Record<string, unknown>);
      if (names.length === 0) {
        errors.push({ path: 'stateMachine.states', message: 'at least one state required' });
      }
      if (names.length > 64) {
        errors.push({ path: 'stateMachine.states', message: 'max 64 states' });
      }
      if (typeof sm.initial !== 'string' || !names.includes(sm.initial)) {
        errors.push({ path: 'stateMachine.initial', message: 'must be a state name in `states`' });
      }
    }
    if (!isArray(sm.transitions)) {
      errors.push({ path: 'stateMachine.transitions', message: 'array required' });
    } else {
      if (sm.transitions.length > 256) {
        errors.push({ path: 'stateMachine.transitions', message: 'max 256 transitions' });
      }
      const statesObj = (sm.states ?? {}) as Record<string, unknown>;
      const stateNames = new Set(Object.keys(statesObj));
      sm.transitions.forEach((t, i) => {
        if (!isObject(t)) {
          errors.push({ path: `stateMachine.transitions[${i}]`, message: 'must be an object' });
          return;
        }
        const tt = t as { from?: unknown; to?: unknown; event?: unknown; guard?: unknown };
        if (typeof tt.from !== 'string' || !stateNames.has(tt.from)) {
          errors.push({
            path: `stateMachine.transitions[${i}].from`,
            message: 'must be a state name in `states`',
          });
        }
        if (typeof tt.to !== 'string' || !stateNames.has(tt.to)) {
          errors.push({
            path: `stateMachine.transitions[${i}].to`,
            message: 'must be a state name in `states`',
          });
        }
        if (typeof tt.event !== 'string' || tt.event.length === 0 || tt.event.length > 64) {
          errors.push({
            path: `stateMachine.transitions[${i}].event`,
            message: '1..64 chars required',
          });
        }
        if (tt.guard !== undefined && (typeof tt.guard !== 'string' || tt.guard.length > 4096)) {
          errors.push({
            path: `stateMachine.transitions[${i}].guard`,
            message: 'string up to 4096 chars',
          });
        }
      });
    }
  }

  if (errors.length) return fail(errors);
  return ok({
    instanceId: instanceId as string,
    stateMachine: stateMachine as StateMachineInput,
    currentState: currentState as string,
    scope: scope as string,
    ...(typeof persistInstanceState === 'boolean' ? { persistInstanceState } : {}),
  });
}

export interface PatchInteractionStateInput {
  readonly currentState?: string;
  readonly scope?: string;
  readonly stateMachine?: StateMachineInput;
  readonly persistInstanceState?: boolean;
}

export function validatePatchInteractionState(
  body: unknown,
): ValidationResult<PatchInteractionStateInput> {
  if (!isObject(body)) return fail([{ path: '', message: 'Body must be an object' }]);
  const errors: ValidationError[] = [];
  type WritablePatch = {
    -readonly [K in keyof PatchInteractionStateInput]: PatchInteractionStateInput[K];
  };
  const out: WritablePatch = {};
  const raw = body as Record<string, unknown>;
  if (raw['currentState'] !== undefined) {
    if (!isString(raw['currentState']) || (raw['currentState'] as string).length < 1) {
      errors.push({ path: 'currentState', message: 'non-empty string required' });
    } else {
      out.currentState = raw['currentState'] as string;
    }
  }
  if (raw['scope'] !== undefined) {
    if (!inSet(ALLOWED_STATE_SCOPES, raw['scope'])) {
      errors.push({ path: 'scope', message: 'invalid scope' });
    } else {
      out.scope = raw['scope'] as string;
    }
  }
  if (raw['persistInstanceState'] !== undefined) {
    if (typeof raw['persistInstanceState'] !== 'boolean') {
      errors.push({ path: 'persistInstanceState', message: 'boolean required' });
    } else {
      out.persistInstanceState = raw['persistInstanceState'] as boolean;
    }
  }
  if (raw['stateMachine'] !== undefined) {
    // Reuse the create-time validator on the nested spec.
    const inner = validateCreateInteractionState({
      instanceId: 'validation-only',
      currentState: 'validation-only',
      scope: 'session',
      stateMachine: raw['stateMachine'],
    });
    if (!inner.valid) {
      for (const e of inner.errors) {
        errors.push({
          path: e.path ? `stateMachine.${e.path}` : 'stateMachine',
          message: e.message,
        });
      }
    } else {
      out.stateMachine = inner.value!.stateMachine;
    }
  }
  if (errors.length) return fail(errors);
  return ok(out);
}

export interface TransitionInput {
  readonly event: string;
  readonly currentState?: string;
}

export function validateTransitionInput(body: unknown): ValidationResult<TransitionInput> {
  if (!isObject(body)) return fail([{ path: '', message: 'Body must be an object' }]);
  const errors: ValidationError[] = [];
  const { event, currentState } = body as { event?: unknown; currentState?: unknown };
  if (!inSet(ALLOWED_STATE_EVENTS, event)) {
    errors.push({ path: 'event', message: 'must be focus|press|click|hover|default' });
  }
  if (currentState !== undefined && (typeof currentState !== 'string' || currentState.length < 1)) {
    errors.push({ path: 'currentState', message: 'string required' });
  }
  if (errors.length) return fail(errors);
  return ok({
    event: event as string,
    ...(typeof currentState === 'string' ? { currentState } : {}),
  });
}

// ── Quizzes (P10 M6.1) ─────────────────────────────────────────────────

export interface CreateQuizInput {
  readonly name: string;
  readonly questions: readonly unknown[];
  readonly passThreshold?: number;
}

export function validateCreateQuiz(body: unknown): ValidationResult<CreateQuizInput> {
  if (!isObject(body)) return fail([{ path: '', message: 'Body must be an object' }]);
  const errors: ValidationError[] = [];
  const bodyObj = body as Record<string, unknown>;
  const name = bodyObj['name'];
  const questions = bodyObj['questions'];
  if (!isString(name) || name.length < 1) {
    errors.push({ path: 'name', message: 'non-empty string required' });
  }
  if (!isArray(questions) || questions.length === 0) {
    errors.push({ path: 'questions', message: 'non-empty array required' });
  } else {
    questions.forEach((q, i) => {
      if (!isObject(q)) {
        errors.push({ path: `questions[${i}]`, message: 'must be an object' });
        return;
      }
      const qq = q as { type?: unknown };
      if (!inSet(ALLOWED_QUESTION_TYPES, qq.type)) {
        errors.push({ path: `questions[${i}].type`, message: 'must be a known question type' });
      }
    });
  }
  const passThreshold = bodyObj['passThreshold'];
  if (
    passThreshold !== undefined &&
    (!isNumber(passThreshold) || passThreshold < 0 || passThreshold > 1)
  ) {
    errors.push({ path: 'passThreshold', message: '0..1 required' });
  }
  if (errors.length) return fail(errors);
  return ok({
    name: name as string,
    questions: questions as readonly unknown[],
    ...(passThreshold !== undefined ? { passThreshold: passThreshold as number } : {}),
  });
}

export interface PatchQuizInput {
  readonly version: number;
  readonly name?: string;
  readonly questions?: readonly unknown[];
  readonly passThreshold?: number;
}

export function validatePatchQuiz(body: unknown): ValidationResult<PatchQuizInput> {
  if (!isObject(body)) return fail([{ path: '', message: 'Body must be an object' }]);
  const errors: ValidationError[] = [];
  const { version } = body as { version?: unknown };
  if (!isNumber(version) || version < 0) {
    errors.push({ path: 'version', message: 'non-negative integer required' });
  }
  if (errors.length) return fail(errors);
  return ok({ version, ...(body as Record<string, unknown>) } as PatchQuizInput);
}

export interface QuizAnswerInput {
  readonly questionId: string;
  readonly value: unknown;
  readonly correct: boolean;
  readonly score: number;
  readonly confidence?: number;
  readonly needsHumanReview?: boolean;
  readonly llmReason?: string;
}

export function validateQuizAnswer(body: unknown): ValidationResult<QuizAnswerInput> {
  if (!isObject(body)) return fail([{ path: '', message: 'Body must be an object' }]);
  const errors: ValidationError[] = [];
  const bodyObj = body as Record<string, unknown>;
  const { questionId, value, correct, score } = bodyObj;
  if (!isString(questionId) || questionId.length < 1) {
    errors.push({ path: 'questionId', message: 'non-empty string required' });
  }
  if (typeof correct !== 'boolean') {
    errors.push({ path: 'correct', message: 'boolean required' });
  }
  if (!isNumber(score) || score < 0 || score > 1) {
    errors.push({ path: 'score', message: 'number in 0..1 required' });
  }
  const confidence = bodyObj['confidence'];
  if (confidence !== undefined && (!isNumber(confidence) || confidence < 0 || confidence > 1)) {
    errors.push({ path: 'confidence', message: 'number in 0..1 required' });
  }
  const needsHumanReview = bodyObj['needsHumanReview'];
  if (needsHumanReview !== undefined && typeof needsHumanReview !== 'boolean') {
    errors.push({ path: 'needsHumanReview', message: 'boolean required' });
  }
  const llmReason = bodyObj['llmReason'];
  if (llmReason !== undefined && (!isString(llmReason) || llmReason.length > 4096)) {
    errors.push({ path: 'llmReason', message: 'string up to 4096 chars' });
  }
  if (errors.length) return fail(errors);
  return {
    valid: true,
    value: {
      questionId: questionId as string,
      value,
      correct: correct as boolean,
      score: score as number,
      ...(confidence !== undefined ? { confidence: confidence as number } : {}),
      ...(needsHumanReview !== undefined ? { needsHumanReview: needsHumanReview as boolean } : {}),
      ...(typeof llmReason === 'string' ? { llmReason } : {}),
    },
    errors: [],
  };
}

export interface StartAttemptInput {
  readonly viewerId: string;
  readonly seed?: string;
}

export function validateStartAttempt(body: unknown): ValidationResult<StartAttemptInput> {
  if (!isObject(body)) return fail([{ path: '', message: 'Body must be an object' }]);
  const errors: ValidationError[] = [];
  const bodyObj = body as Record<string, unknown>;
  const viewerId = bodyObj['viewerId'];
  if (!isString(viewerId) || viewerId.length < 1) {
    errors.push({ path: 'viewerId', message: 'non-empty string required' });
  }
  const seed = bodyObj['seed'];
  if (seed !== undefined && (!isString(seed) || seed.length > 256)) {
    errors.push({ path: 'seed', message: 'string up to 256 chars' });
  }
  if (errors.length) return fail(errors);
  return ok({
    viewerId: viewerId as string,
    ...(typeof seed === 'string' ? { seed } : {}),
  });
}

export interface LlmReviewUpdateInput {
  readonly status?: 'pending' | 'approved' | 'rejected' | 'overridden';
  readonly reviewerId?: string | null;
  readonly overrideScore?: number | null;
}

export function validateLlmReviewUpdate(body: unknown): ValidationResult<LlmReviewUpdateInput> {
  if (!isObject(body)) return fail([{ path: '', message: 'Body must be an object' }]);
  const errors: ValidationError[] = [];
  type Writable = { -readonly [K in keyof LlmReviewUpdateInput]: LlmReviewUpdateInput[K] };
  const out: Writable = {};
  const raw = body as Record<string, unknown>;
  if (raw['status'] !== undefined) {
    if (!inSet(['pending', 'approved', 'rejected', 'overridden'] as const, raw['status'])) {
      errors.push({ path: 'status', message: 'must be pending|approved|rejected|overridden' });
    } else {
      out.status = raw['status'] as 'pending' | 'approved' | 'rejected' | 'overridden';
    }
  }
  if (raw['reviewerId'] !== undefined) {
    if (raw['reviewerId'] === null || isString(raw['reviewerId'])) {
      out.reviewerId = raw['reviewerId'] as string | null;
    } else {
      errors.push({ path: 'reviewerId', message: 'string or null required' });
    }
  }
  if (raw['overrideScore'] !== undefined) {
    if (raw['overrideScore'] === null || isNumber(raw['overrideScore'])) {
      out.overrideScore = raw['overrideScore'] as number | null;
    } else {
      errors.push({ path: 'overrideScore', message: 'number or null required' });
    }
  }
  if (errors.length) return fail(errors);
  return ok(out);
}

// ── Presentation sequences (P10 M6.2) ──────────────────────────────────

export interface CreatePresentationSequenceInput {
  readonly name: string;
  readonly slides: readonly string[];
  readonly intervalMs: number;
  readonly pauseOnEvent?: boolean;
  readonly loop?: boolean;
  readonly count?: number;
  readonly interruptionPolicy?: string;
  readonly reducedMotionDefaultOff?: boolean;
  readonly pauseWarnAtMs?: number;
}

export function validateCreatePresentationSequence(
  body: unknown,
): ValidationResult<CreatePresentationSequenceInput> {
  if (!isObject(body)) return fail([{ path: '', message: 'Body must be an object' }]);
  const errors: ValidationError[] = [];
  const bodyObj = body as Record<string, unknown>;
  const name = bodyObj['name'];
  const slides = bodyObj['slides'];
  const intervalMs = bodyObj['intervalMs'];
  if (!isString(name) || name.length < 1) {
    errors.push({ path: 'name', message: 'non-empty string required' });
  }
  if (!isArray(slides) || slides.length === 0) {
    errors.push({ path: 'slides', message: 'non-empty array required' });
  } else if (!slides.every((s) => isString(s))) {
    errors.push({ path: 'slides', message: 'every element must be a slide id string' });
  }
  if (!isNumber(intervalMs) || intervalMs < 50 || intervalMs > 86_400_000) {
    errors.push({ path: 'intervalMs', message: 'integer 50..86_400_000' });
  }

  const pauseOnEvent = bodyObj['pauseOnEvent'];
  if (pauseOnEvent !== undefined && typeof pauseOnEvent !== 'boolean') {
    errors.push({ path: 'pauseOnEvent', message: 'boolean required' });
  }
  const loop = bodyObj['loop'];
  if (loop !== undefined && typeof loop !== 'boolean') {
    errors.push({ path: 'loop', message: 'boolean required' });
  }
  const count = bodyObj['count'];
  if (count !== undefined && (!isNumber(count) || count < 1 || count > 1024)) {
    errors.push({ path: 'count', message: 'integer 1..1024' });
  }
  const interruptionPolicy = bodyObj['interruptionPolicy'];
  if (
    interruptionPolicy !== undefined &&
    !inSet(ALLOWED_INTERRUPTION_POLICIES, interruptionPolicy)
  ) {
    errors.push({ path: 'interruptionPolicy', message: 'must be ignore|queue|abort' });
  }
  const reducedMotionDefaultOff = bodyObj['reducedMotionDefaultOff'];
  if (reducedMotionDefaultOff !== undefined && typeof reducedMotionDefaultOff !== 'boolean') {
    errors.push({ path: 'reducedMotionDefaultOff', message: 'boolean required' });
  }
  const pauseWarnAtMs = bodyObj['pauseWarnAtMs'];
  if (
    pauseWarnAtMs !== undefined &&
    (!isNumber(pauseWarnAtMs) || pauseWarnAtMs < 1000 || pauseWarnAtMs > 7_200_000)
  ) {
    errors.push({ path: 'pauseWarnAtMs', message: 'integer 1000..7_200_000 (max 2h)' });
  }

  if (errors.length) return fail(errors);
  return ok({
    name: name as string,
    slides: slides as readonly string[],
    intervalMs: intervalMs as number,
    ...(pauseOnEvent !== undefined ? { pauseOnEvent: pauseOnEvent as boolean } : {}),
    ...(loop !== undefined ? { loop: loop as boolean } : {}),
    ...(count !== undefined ? { count: count as number } : {}),
    ...(interruptionPolicy !== undefined
      ? { interruptionPolicy: interruptionPolicy as string }
      : {}),
    ...(reducedMotionDefaultOff !== undefined
      ? { reducedMotionDefaultOff: reducedMotionDefaultOff as boolean }
      : {}),
    ...(pauseWarnAtMs !== undefined ? { pauseWarnAtMs: pauseWarnAtMs as number } : {}),
  });
}

export interface PatchPresentationSequenceInput {
  readonly version: number;
  readonly name?: string;
  readonly slides?: readonly string[];
  readonly intervalMs?: number;
  readonly pauseOnEvent?: boolean;
  readonly loop?: boolean;
  readonly count?: number;
  readonly interruptionPolicy?: string;
  readonly reducedMotionDefaultOff?: boolean;
  readonly pauseWarnAtMs?: number;
}

export function validatePatchPresentationSequence(
  body: unknown,
): ValidationResult<PatchPresentationSequenceInput> {
  if (!isObject(body)) return fail([{ path: '', message: 'Body must be an object' }]);
  const errors: ValidationError[] = [];
  const bodyObj = body as Record<string, unknown>;
  const version = bodyObj['version'];
  if (!isNumber(version) || version < 0) {
    errors.push({ path: 'version', message: 'non-negative integer required' });
  }
  if (
    bodyObj['interruptionPolicy'] !== undefined &&
    !inSet(ALLOWED_INTERRUPTION_POLICIES, bodyObj['interruptionPolicy'])
  ) {
    errors.push({ path: 'interruptionPolicy', message: 'must be ignore|queue|abort' });
  }
  if (errors.length) return fail(errors);
  return ok({
    version: version as number,
    ...(body as Record<string, unknown>),
  } as PatchPresentationSequenceInput);
}
