/**
 * Shared types for the prototype runtime.
 *
 * The runtime is split across two surfaces:
 *   1. The pure-TS in-process engine (VarStore, BindingsDAG, RuleEvaluator,
 *      ActionExecutor, BranchingGraph, HitTest, OverlayStack).
 *   2. The persisted CRUD layer (`services/prototype-runtime`) which uses
 *      these types on the wire via JSON-Schema / OpenAPI contracts.
 *
 * All persisted records carry `tenantId` so handlers can map into RLS
 * contexts. The runtime is tenant-agnostic — it operates on whatever
 * snapshot it is handed.
 */

// ── Variables ───────────────────────────────────────────────────────────

/** Scope ladder: lower-scope writes do NOT shadow reads from higher scopes. */
export type VariableScope =
  | 'deck' // deck-wide default
  | 'slide' // overrides for the current slide only
  | 'component_instance' // per-instance state
  | 'session' // session-scoped (single visitor's session)
  | 'viewer'; // viewer-scoped (single viewer across sessions)

export const SCOPE_ORDER: readonly VariableScope[] = [
  'viewer',
  'session',
  'component_instance',
  'slide',
  'deck',
] as const;

/** Type tag for runtime values. Determines which operations are valid. */
export type VariableType = 'string' | 'number' | 'boolean' | 'enum' | 'json' | 'array';

/** Visibility of a variable in deep-link snapshots, exports, MCP reads. */
export type VariableVisibility = 'deck_public' | 'private' | 'server_only';

export interface Variable<TValue = unknown> {
  readonly id: string;
  readonly tenantId: string;
  readonly deckId: string;
  /** Logical name (without `$`); unique within a deck. */
  readonly name: string;
  readonly scope: VariableScope;
  readonly type: VariableType;
  /** Allowed values for `enum`; ignored otherwise. */
  readonly enumValues?: readonly string[];
  /** Numeric range for `number`; ignored otherwise. */
  readonly min?: number;
  readonly max?: number;
  readonly defaultValue: TValue;
  readonly visibility: VariableVisibility;
  readonly readOnly: boolean;
  /** Increments monotonically; matches the P05/P08 optimistic-lock pattern. */
  readonly version: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

// ── Bindings ────────────────────────────────────────────────────────────

export type TargetKind =
  | 'element_prop'
  | 'slide_prop'
  | 'deck_prop'
  | 'overlay_open'
  | 'hotspot_target';

export interface VariableBinding {
  readonly id: string;
  readonly tenantId: string;
  readonly deckId: string;
  readonly variableId: string;
  readonly targetKind: TargetKind;
  readonly targetId: string;
  readonly targetProp: string;
  /** Optional expression to transform the variable value before write. */
  readonly transform?: string;
  readonly version: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

// ── Conditional rules ───────────────────────────────────────────────────

export type ActionKind =
  | 'show'
  | 'hide'
  | 'enable'
  | 'disable'
  | 'set_variable'
  | 'navigate_to'
  | 'play_animation'
  | 'submit_form'
  | 'open_overlay'
  | 'close_overlay';

export interface Action {
  readonly kind: ActionKind;
  /** Per-action payload — same shape as the JSON-Schema contract. */
  readonly params: Readonly<Record<string, unknown>>;
}

export interface ConditionalRule {
  readonly id: string;
  readonly tenantId: string;
  readonly deckId: string;
  readonly name: string;
  /** `priority desc, created_at asc` ordering — see RuleEvaluator. */
  readonly priority: number;
  /** Compiled expression — produced by `compileExpression(source)`. */
  readonly condition: unknown;
  /** Source text for editing/display. */
  readonly conditionSource: string;
  /** Optional scope filter: only fire on the given slide. `null` = deck-wide. */
  readonly scopeSlideId: string | null;
  /** Action to dispatch on match. */
  readonly action: Action;
  readonly enabled: boolean;
  readonly version: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

// ── Hotspots ────────────────────────────────────────────────────────────

export type GestureMask = 'click' | 'double_click' | 'long_press' | 'hover' | 'focus';

export type HotspotTargetType = 'slide' | 'url' | 'overlay' | 'action';

/**
 * Geometry in normalized `[0..1]` coordinates. Two shapes:
 *   - `rect`: `{x, y, w, h}`
 *   - `polygon`: `[{x, y}, ...]` (≥ 3 vertices)
 */
export type HotspotGeometry =
  | {
      readonly kind: 'rect';
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
    }
  | {
      readonly kind: 'polygon';
      readonly points: ReadonlyArray<{ readonly x: number; readonly y: number }>;
    };

export interface Hotspot {
  readonly id: string;
  readonly tenantId: string;
  readonly deckId: string;
  readonly slideId: string;
  readonly name: string;
  readonly geometry: HotspotGeometry;
  /** Bitmask of gestures. Default `['click']`. */
  readonly gestureMask: readonly GestureMask[];
  /** Stacking order for nested hotspots — innermost wins at runtime. */
  readonly zIndex: number;
  readonly targetType: HotspotTargetType;
  /** Discriminated by `targetType`. */
  readonly targetRef: Readonly<Record<string, unknown>>;
  /** `dangling` = target slide deleted; runtime skips the click. */
  readonly status: 'ok' | 'dangling';
  readonly version: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

// ── Overlays ────────────────────────────────────────────────────────────

export type OverlayType = 'modal' | 'tooltip' | 'drawer' | 'popover' | 'sheet';

export type OverlaySizeStrategy = 'small' | 'medium' | 'large' | 'fullscreen' | 'auto';

export interface Overlay {
  readonly id: string;
  readonly tenantId: string;
  readonly deckId: string;
  readonly slideId: string;
  readonly name: string;
  readonly type: OverlayType;
  readonly sizeStrategy: OverlaySizeStrategy;
  readonly anchor: { readonly x: number; readonly y: number } | null;
  readonly openTrigger: {
    readonly kind: string;
    readonly params?: Readonly<Record<string, unknown>>;
  } | null;
  readonly closeTrigger: {
    readonly kind: string;
    readonly params?: Readonly<Record<string, unknown>>;
  } | null;
  /** Persistent overlays do not auto-close on slide change. */
  readonly persistent: boolean;
  readonly schema: Readonly<Record<string, unknown>>;
  readonly version: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

// ── Branching edges ─────────────────────────────────────────────────────

export interface BranchingEdge {
  readonly id: string;
  readonly tenantId: string;
  readonly deckId: string;
  readonly fromSlideId: string;
  readonly toSlideId: string;
  readonly name: string;
  /** Optional rule id; if null the edge is unconditional. */
  readonly ruleId: string | null;
  /** Stacking order for the Connections graph view. */
  readonly priority: number;
  readonly createdAt: number;
}

// ── Interaction states ──────────────────────────────────────────────────

export type InteractionStateScope = 'session' | 'slide' | 'deck' | 'persistent_session';

export interface InteractionStateTransition {
  readonly from: string;
  readonly to: string;
  readonly event: string;
  /** Optional guard expression. */
  readonly guard?: string;
}

/**
 * Canonical state-machine spec used by all P10 M3 surfaces. Editors
 * persist this verbatim; the runtime parses it through `StateMachine`.
 */
export interface InteractionStateMachineSpec {
  /** Map from state name → state definition. */
  readonly states: Readonly<Record<string, InteractionStateMachineNode>>;
  readonly initial: string;
  readonly transitions: readonly InteractionStateTransition[];
}

/** A node in the state-machine graph (state definition). */
export interface InteractionStateMachineNode {
  readonly label?: string;
  readonly meta?: Readonly<Record<string, unknown>>;
}

export interface InteractionState {
  readonly id: string;
  readonly tenantId: string;
  readonly deckId: string;
  /** Component instance this state machine belongs to. */
  readonly instanceId: string;
  /** State-machine definition (P10 M3). */
  readonly stateMachine: InteractionStateMachineSpec;
  readonly currentState: string;
  readonly scope: InteractionStateScope;
  /**
   * If true and `scope === 'slide'`, the state survives slide-enter
   * resets. P10 M3 — was implicit previously.
   */
  readonly persistInstanceState: boolean;
  readonly updatedAt: number;
}

// ── Runtime helpers ─────────────────────────────────────────────────────

/**
 * Bounded snapshot used by VarStore.snapshot / restore and by deep-link
 * payloads (M7 will reuse this verbatim when the codec lands).
 */
export interface VarSnapshot {
  readonly deckId: string;
  readonly scope: VariableScope;
  readonly values: Readonly<Record<string, unknown>>;
  readonly takenAt: number;
}

/** Result of a rule evaluation. */
export interface RuleEvaluationResult {
  readonly matched: boolean;
  readonly ruleId: string | null;
  readonly action: Action | null;
  readonly elapsedMs: number;
}

/** Cycle report returned by `detectCycles`. */
export interface CycleReport {
  readonly hasCycle: boolean;
  readonly cycles: ReadonlyArray<ReadonlyArray<string>>;
  readonly unreachable: ReadonlyArray<string>;
  readonly islands: ReadonlyArray<ReadonlyArray<string>>;
}

// ── Quizzes (M6.1) ──────────────────────────────────────────────────────

export type QuestionType =
  | 'multiple_choice'
  | 'multi_select'
  | 'true_false'
  | 'short_answer'
  | 'fill_blank'
  | 'drag_to_match'
  | 'hotspot_quiz'
  | 'flash_card'
  | 'short_answer_llm';

/** Result of validating an answer against a question's expected value. */
export interface QuestionValidationResult {
  readonly correct: boolean;
  /** 0..1 confidence — only present when the validator is non-deterministic
   *  (LLM-graded short answers). For deterministic validators this is 1.0. */
  readonly confidence: number;
  /** 0..1 score — always present; partial credit for some validators. */
  readonly score: number;
  /** True when this answer was below the LLM fallback threshold and was
   *  enqueued for human review. */
  readonly needsHumanReview?: boolean;
}

/**
 * QuestionSpec — the persisted shape of a question inside a `Quiz`.
 *
 * The shape is intentionally discriminated on `type` so that each
 * question type can carry its own payload. Validators in
 * `question-types/` interpret each variant.
 */
export type QuestionSpec =
  | {
      readonly id: string;
      readonly type: 'multiple_choice';
      readonly prompt: string;
      /** Single correct choice id. */
      readonly correctChoiceId: string;
      readonly choices: ReadonlyArray<{ readonly id: string; readonly label: string }>;
      /** Optional points; defaults to 1. */
      readonly points?: number;
    }
  | {
      readonly id: string;
      readonly type: 'multi_select';
      readonly prompt: string;
      /** All must match (set equality). */
      readonly correctChoiceIds: readonly string[];
      readonly choices: ReadonlyArray<{ readonly id: string; readonly label: string }>;
      readonly points?: number;
    }
  | {
      readonly id: string;
      readonly type: 'true_false';
      readonly prompt: string;
      readonly correct: boolean;
      readonly points?: number;
    }
  | {
      readonly id: string;
      readonly type: 'short_answer';
      readonly prompt: string;
      /** Accepted answers (case-insensitive contains match). */
      readonly acceptedAnswers: readonly string[];
      /** 0..1 similarity threshold; default 0.85. */
      readonly typoTolerance?: number;
      readonly points?: number;
    }
  | {
      readonly id: string;
      readonly type: 'fill_blank';
      readonly prompt: string;
      /** One accepted answer per blank, in order. */
      readonly blanks: ReadonlyArray<{
        readonly id: string;
        readonly acceptedAnswers: readonly string[];
        readonly typoTolerance?: number;
      }>;
      readonly points?: number;
    }
  | {
      readonly id: string;
      readonly type: 'drag_to_match';
      readonly prompt: string;
      readonly pairs: ReadonlyArray<{ readonly left: string; readonly right: string }>;
      readonly points?: number;
    }
  | {
      readonly id: string;
      readonly type: 'hotspot_quiz';
      readonly prompt: string;
      readonly geometry: HotspotGeometry;
      /** Tolerance in normalized [0..1] space; default 0.04. */
      readonly tolerance?: number;
      readonly points?: number;
    }
  | {
      readonly id: string;
      readonly type: 'flash_card';
      readonly prompt: string;
      /** Front of the card. */
      readonly front: string;
      /** Back of the card. */
      readonly back: string;
    }
  | {
      readonly id: string;
      readonly type: 'short_answer_llm';
      readonly prompt: string;
      /** Reference answer the LLM grades against. */
      readonly referenceAnswer: string;
      /** Confidence cutoff for LLM-graded answer; below → human queue. */
      readonly fallbackThreshold?: number;
      readonly points?: number;
    };

export interface Quiz {
  readonly id: string;
  readonly tenantId: string;
  readonly deckId: string;
  readonly name: string;
  /** Ordered list — order matters for deterministic presentation. */
  readonly questions: readonly QuestionSpec[];
  /** Pass threshold 0..1; default 0.7. */
  readonly passThreshold?: number;
  readonly version: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** One attempt at a quiz by a viewer. */
export interface QuizAttempt {
  readonly id: string;
  readonly tenantId: string;
  readonly deckId: string;
  readonly quizId: string;
  /** Stable per-attempt seed so re-attempts are deterministic. */
  readonly seed: string;
  /** Identifier for the viewer; opaque. */
  readonly viewerId: string;
  readonly startedAt: number;
  readonly completedAt: number | null;
  readonly status: 'in_progress' | 'completed' | 'abandoned';
  readonly currentQuestionId: string | null;
  readonly score: number;
  readonly passed: boolean | null;
}

/** A persisted answer submitted by a viewer for one question. */
export interface QuizAnswer {
  readonly id: string;
  readonly tenantId: string;
  readonly attemptId: string;
  readonly questionId: string;
  /** Free-form — discriminated by question type at validation time. */
  readonly value: unknown;
  readonly correct: boolean;
  readonly score: number;
  /** Only set for LLM-graded answers. */
  readonly confidence?: number;
  readonly needsHumanReview: boolean;
  readonly submittedAt: number;
}

/** Aggregate result of an attempt. */
export interface QuizResult {
  readonly id: string;
  readonly tenantId: string;
  readonly attemptId: string;
  readonly quizId: string;
  readonly totalScore: number;
  readonly maxScore: number;
  readonly percentage: number;
  readonly passed: boolean;
  readonly answers: readonly QuizAnswer[];
  readonly completedAt: number;
}

/** LLM review queue row for low-confidence short-answer responses. */
export interface LlmReviewQueueItem {
  readonly id: string;
  readonly tenantId: string;
  readonly deckId: string;
  readonly quizId: string;
  readonly attemptId: string;
  readonly questionId: string;
  readonly submittedAnswer: string;
  readonly llmConfidence: number;
  readonly llmReason: string;
  readonly status: 'pending' | 'approved' | 'rejected' | 'overridden';
  readonly reviewerId: string | null;
  readonly overrideScore: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

// ── Presentation sequences (M6.2) ───────────────────────────────────────

export type InterruptionPolicy = 'ignore' | 'queue' | 'abort';

export interface PresentationSequence {
  readonly id: string;
  readonly tenantId: string;
  readonly deckId: string;
  readonly name: string;
  /** Slide ids in playback order. */
  readonly slides: readonly string[];
  /** Time on each slide, in ms. */
  readonly intervalMs: number;
  /** When true, pauses on user interaction events. */
  readonly pauseOnEvent: boolean;
  /** Loop forever after `count` is exhausted. */
  readonly loop: boolean;
  /** Times to play the sequence; 0 = infinite. */
  readonly count: number;
  /** How to handle interruptions (clicks, hot-spot taps). */
  readonly interruptionPolicy: InterruptionPolicy;
  /** When true, the sequence is off by default under reduced-motion. */
  readonly reducedMotionDefaultOff: boolean;
  /** Pause warn at ms (default 30 min). */
  readonly pauseWarnAtMs: number;
  readonly version: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}
