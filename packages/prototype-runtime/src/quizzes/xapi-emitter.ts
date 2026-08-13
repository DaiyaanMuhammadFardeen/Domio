/**
 * xAPI statement emitter for quiz state transitions.
 *
 * Spec: builds `{ actor, verb, object, result }` statements compatible
 * with the xAPI 1.0.3 spec. Statements are replayable by Yet
 * Analytics SCORM Cloud and other LRS implementations.
 *
 * Verbs used (M6.1):
 *   - `experienced` — viewer saw the quiz
 *   - `answered`   — viewer submitted an answer
 *   - `completed`  — attempt finalized
 *   - `passed`     — score ≥ pass threshold
 *   - `failed`     — score < pass threshold
 *
 * The emitter is intentionally framework-free: it produces statement
 * objects. Callers serialize + POST to the LRS (Yet Analytics SCORM
 * Cloud or in-house). The service `POST /xapi` endpoint forwards
 * statements verbatim.
 */

export type XapiVerbId =
  | 'http://adlnet.gov/expapi/verbs/experienced'
  | 'http://adlnet.gov/expapi/verbs/answered'
  | 'http://adlnet.gov/expapi/verbs/completed'
  | 'http://adlnet.gov/expapi/verbs/passed'
  | 'http://adlnet.gov/expapi/verbs/failed';

export interface XapiActor {
  readonly mbox: string;
  readonly name?: string;
}

export interface XapiObject {
  readonly id: string;
  readonly definition: {
    readonly name: { readonly 'en-US': string };
    readonly type: string;
    readonly description?: { readonly 'en-US': string };
  };
}

export interface XapiResult {
  readonly score?: { readonly raw: number; readonly min: number; readonly max: number };
  readonly success?: boolean;
  readonly completion?: boolean;
  readonly duration?: string; // ISO 8601 duration
  readonly response?: string;
}

export interface XapiStatement {
  readonly id: string;
  readonly actor: XapiActor;
  readonly verb: { readonly id: XapiVerbId; readonly display: { readonly 'en-US': string } };
  readonly object: XapiObject;
  readonly result?: XapiResult;
  readonly timestamp: string; // ISO 8601
  readonly stored?: string;
  readonly authority?: { readonly mbox: string; readonly name?: string };
  readonly version: '1.0.3';
  readonly context?: {
    readonly registration?: string;
    readonly extensions?: Record<string, unknown>;
  };
}

export interface XapiEmitterOptions {
  readonly actor: XapiActor;
  readonly authority?: { readonly mbox: string; readonly name?: string };
}

export interface XapiQuizContext {
  readonly quizId: string;
  readonly deckId: string;
  readonly attemptId?: string;
  readonly questionId?: string;
}

export const QUIZ_OBJECT_TYPE = 'http://adlnet.gov/expapi/activities/assessment';

/**
 * Generate a UUID-like id for an xAPI statement. Uses Math.random —
 * good enough for trace ids; LRS-side uniqueness is the LRS's job.
 */
function generateStatementId(): string {
  // RFC 4122 v4 — replaceable with a stronger RNG in production.
  const r = () =>
    Math.floor(Math.random() * 0xffff)
      .toString(16)
      .padStart(4, '0');
  return `${r()}${r()}-${r()}-4${r().slice(1)}-${r()}-${r()}${r()}${r()}`;
}

export class XapiEmitter {
  private readonly opts: XapiEmitterOptions;
  private readonly statements: XapiStatement[] = [];

  constructor(opts: XapiEmitterOptions) {
    this.opts = opts;
  }

  /** List all emitted statements in order. */
  list(): readonly XapiStatement[] {
    return this.statements;
  }

  /** Drop all buffered statements. */
  reset(): void {
    this.statements.length = 0;
  }

  /** Build (and store) the statement, returning it. */
  private emit(
    verb: XapiVerbId,
    verbDisplay: string,
    object: XapiObject,
    result?: XapiResult,
    context?: { registration?: string; extensions?: Record<string, unknown> },
  ): XapiStatement {
    const statement: XapiStatement = {
      id: generateStatementId(),
      actor: this.opts.actor,
      verb: { id: verb, display: { 'en-US': verbDisplay } },
      object,
      ...(result !== undefined ? { result } : {}),
      timestamp: new Date().toISOString(),
      ...(this.opts.authority !== undefined ? { authority: this.opts.authority } : {}),
      version: '1.0.3',
      ...(context !== undefined ? { context } : {}),
    };
    this.statements.push(statement);
    return statement;
  }

  /** Emit `experienced` when the viewer first sees the quiz. */
  experienced(ctx: XapiQuizContext, quizName: string): XapiStatement {
    const object: XapiObject = {
      id: `domio://quiz/${ctx.quizId}`,
      definition: {
        name: { 'en-US': quizName },
        type: QUIZ_OBJECT_TYPE,
      },
    };
    return this.emit(
      'http://adlnet.gov/expapi/verbs/experienced',
      'experienced',
      object,
      { completion: false },
      { ...(ctx.attemptId !== undefined ? { registration: ctx.attemptId } : {}) },
    );
  }

  /** Emit `answered` for a single question submission. */
  answered(
    ctx: XapiQuizContext & { readonly response: string; readonly correct: boolean },
    questionName: string,
  ): XapiStatement {
    const object: XapiObject = {
      id: `domio://quiz/${ctx.quizId}/question/${ctx.questionId ?? 'unknown'}`,
      definition: {
        name: { 'en-US': questionName },
        type: 'http://adlnet.gov/expapi/activities/cmi.interaction',
      },
    };
    return this.emit(
      'http://adlnet.gov/expapi/verbs/answered',
      'answered',
      object,
      {
        success: ctx.correct,
        response: ctx.response,
      },
      {
        ...(ctx.attemptId !== undefined ? { registration: ctx.attemptId } : {}),
        extensions: {
          'https://domio.dev/xapi/quiz-id': ctx.quizId,
          'https://domio.dev/xapi/deck-id': ctx.deckId,
        },
      },
    );
  }

  /** Emit `completed` (and optionally `passed`/`failed`) when an attempt finalizes. */
  completed(
    ctx: XapiQuizContext,
    quizName: string,
    score: { readonly raw: number; readonly min: number; readonly max: number },
    passed: boolean,
    durationIso8601?: string,
  ): readonly [XapiStatement, XapiStatement?] {
    const object: XapiObject = {
      id: `domio://quiz/${ctx.quizId}`,
      definition: {
        name: { 'en-US': quizName },
        type: QUIZ_OBJECT_TYPE,
      },
    };
    const completedResult: XapiResult = {
      score,
      success: passed,
      completion: true,
      ...(durationIso8601 !== undefined ? { duration: durationIso8601 } : {}),
    };
    const completedStatement = this.emit(
      'http://adlnet.gov/expapi/verbs/completed',
      'completed',
      object,
      completedResult,
      { ...(ctx.attemptId !== undefined ? { registration: ctx.attemptId } : {}) },
    );
    if (passed) {
      const passedStatement = this.emit(
        'http://adlnet.gov/expapi/verbs/passed',
        'passed',
        object,
        { score, success: true },
        { ...(ctx.attemptId !== undefined ? { registration: ctx.attemptId } : {}) },
      );
      return [completedStatement, passedStatement];
    }
    const failedStatement = this.emit(
      'http://adlnet.gov/expapi/verbs/failed',
      'failed',
      object,
      { score, success: false },
      { ...(ctx.attemptId !== undefined ? { registration: ctx.attemptId } : {}) },
    );
    return [completedStatement, failedStatement];
  }
}
