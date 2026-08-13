import type { McpContext } from '@domio/agent-schema';
import {
  MCPError,
  callPrototypeRuntime,
  validateObject,
  validateString,
  withAuditTrail,
  type McpTool,
  type ValidationResult,
} from './types.js';
import { claimCapability } from '../../router.js';

export interface QuizCreateInput {
  readonly deckId: string;
  readonly id?: string;
  readonly title: string;
  readonly questions: ReadonlyArray<{
    readonly id: string;
    readonly prompt: string;
    readonly options: ReadonlyArray<{ id: string; label: string }>;
    readonly correctOptionId: string;
  }>;
}
export interface QuizSubmitInput {
  readonly deckId: string;
  readonly quizId: string;
  readonly answers: Record<string, string>;
}
export interface QuizListInput {
  readonly deckId: string;
}
export interface Quiz {
  readonly id: string;
  readonly title: string;
  readonly questions: ReadonlyArray<unknown>;
}

function validateCreate(input: unknown): ValidationResult<QuizCreateInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const o = input as Record<string, unknown>;
  const deckId = validateString(o['deckId'], 'deckId', issues);
  const title = validateString(o['title'], 'title', issues);
  if (!Array.isArray(o['questions']) || (o['questions'] as unknown[]).length === 0) {
    issues.push('questions must be a non-empty array');
  }
  if (!deckId || !title || issues.length > 0) return { ok: false, code: 'INVALID_INPUT', issues };
  const id = typeof o['id'] === 'string' ? o['id'] : undefined;
  const value: QuizCreateInput = id
    ? { deckId, id, title, questions: o['questions'] as QuizCreateInput['questions'] }
    : { deckId, title, questions: o['questions'] as QuizCreateInput['questions'] };
  return { ok: true, value };
}

function validateSubmit(input: unknown): ValidationResult<QuizSubmitInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const o = input as Record<string, unknown>;
  const deckId = validateString(o['deckId'], 'deckId', issues);
  const quizId = validateString(o['quizId'], 'quizId', issues);
  const answers = validateObject(o['answers'], 'answers', issues);
  if (!deckId || !quizId || !answers) return { ok: false, code: 'INVALID_INPUT', issues };
  return { ok: true, value: { deckId, quizId, answers: answers as Record<string, string> } };
}

function validateList(input: unknown): ValidationResult<QuizListInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const deckId = validateString((input as Record<string, unknown>)['deckId'], 'deckId', issues);
  if (!deckId) return { ok: false, code: 'INVALID_INPUT', issues };
  return { ok: true, value: { deckId } };
}

function gate(ctx: McpContext, cap: 'quizzes:read' | 'quizzes:write' | 'quizzes:answer') {
  const r = claimCapability(ctx.agentId, cap);
  if (!r.granted) throw new MCPError('PERMISSION_DENIED', r.reason ?? 'permission denied');
}

export const create_quiz: McpTool<QuizCreateInput, Quiz> = {
  name: 'create_quiz',
  description: 'Create a quiz on a deck.',
  capability: 'quizzes:write',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  handler: async (ctx, input) => {
    gate(ctx, 'quizzes:write');
    const v = validateCreate(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'create_quiz', v.value, () =>
      callPrototypeRuntime(ctx, 'POST', `/decks/${v.value.deckId}/quizzes`, v.value).then(
        (r) => r as Quiz,
      ),
    );
  },
};

export const submit_answer: McpTool<QuizSubmitInput, { score: number; correctCount: number }> = {
  name: 'submit_answer',
  description: 'Submit answers to a quiz.',
  capability: 'quizzes:answer',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  handler: async (ctx, input) => {
    gate(ctx, 'quizzes:answer');
    const v = validateSubmit(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'submit_answer', { ...v.value, answers: '<<redacted>>' }, () =>
      callPrototypeRuntime(
        ctx,
        'POST',
        `/decks/${v.value.deckId}/quizzes/${v.value.quizId}/submit`,
        {
          answers: v.value.answers,
        },
      ).then((r) => r as { score: number; correctCount: number }),
    );
  },
};

export const list_quizzes: McpTool<QuizListInput, readonly Quiz[]> = {
  name: 'list_quizzes',
  description: 'List quizzes.',
  capability: 'quizzes:read',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'array', items: { type: 'object' } },
  handler: async (ctx, input) => {
    gate(ctx, 'quizzes:read');
    const v = validateList(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'list_quizzes', v.value, () =>
      callPrototypeRuntime(ctx, 'GET', `/decks/${v.value.deckId}/quizzes`).then((r) =>
        (r as Quiz[]).slice(),
      ),
    );
  },
};

export const quizTools = [create_quiz, submit_answer, list_quizzes] as const;
