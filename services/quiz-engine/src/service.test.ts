import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryEdgeBus } from '@domio/edge-pubsub';
import { InMemoryQuizStore } from './store/mem_store.js';
import { QuizEngine } from './service.js';
import { HashChainedQuizAuditEmitter } from './audit/emit.js';

describe('quiz-engine', () => {
  let bus: InMemoryEdgeBus;
  let store: InMemoryQuizStore;
  let audit: HashChainedQuizAuditEmitter;
  let engine: QuizEngine;

  beforeEach(() => {
    bus = new InMemoryEdgeBus();
    store = new InMemoryQuizStore();
    audit = new HashChainedQuizAuditEmitter({ workspaceId: 'w1', key: new Uint8Array(32) });
    engine = new QuizEngine({ store, bus, audit });
  });

  it('creates a quiz, opens, scores answers', async () => {
    const quiz = await engine.create({
      workspace_id: 'w1', session_id: 's1', widget_id: 'w-1',
      title: 'Pop quiz', created_by: 'p1',
    });
    expect(quiz.status).toBe('draft');
    const q1 = await engine.addQuestion({
      workspace_id: 'w1', quiz_id: quiz.id,
      prompt: 'What is 2+2?', choices: [{ label: '4' }, { label: '5' }],
      correct_index: 0, points: 10,
    });
    const q2 = await engine.addQuestion({
      workspace_id: 'w1', quiz_id: quiz.id,
      prompt: 'Capital of France?', choices: [{ label: 'Paris' }, { label: 'Rome' }],
      correct_index: 0, points: 10,
    });
    const opened = await engine.open(quiz.id, 1, 'p1');
    expect(opened.status).toBe('open');
    const a1 = await engine.answer({
      workspace_id: 'w1', quiz_id: quiz.id, question_id: q1.id,
      participant_id: 'u-1', choice_index: 0, idempotency_key: 'k1',
    });
    expect(a1.is_correct).toBe(true);
    expect(a1.points_awarded).toBe(10);
    const a2 = await engine.answer({
      workspace_id: 'w1', quiz_id: quiz.id, question_id: q2.id,
      participant_id: 'u-1', choice_index: 1, idempotency_key: 'k2',
    });
    expect(a2.is_correct).toBe(false);
    const a3 = await engine.answer({
      workspace_id: 'w1', quiz_id: quiz.id, question_id: q1.id,
      participant_id: 'u-2', choice_index: 1, idempotency_key: 'k3',
    });
    expect(a3.is_correct).toBe(false);
    const board = await engine.leaderboard(quiz.id);
    expect(board).toHaveLength(2);
    expect(board[0]?.participant_id).toBe('u-1');
    expect(board[0]?.total_points).toBe(10);
    expect(board[0]?.correct_count).toBe(1);
    expect(board[1]?.participant_id).toBe('u-2');
    expect(board[1]?.total_points).toBe(0);
  });

  it('rejects duplicate answer per (question, participant)', async () => {
    const quiz = await engine.create({
      workspace_id: 'w1', session_id: 's1', widget_id: 'w-1',
      title: 'Q', created_by: 'p1',
    });
    const q1 = await engine.addQuestion({
      workspace_id: 'w1', quiz_id: quiz.id,
      prompt: 'P', choices: [{ label: 'A' }, { label: 'B' }],
      correct_index: 0,
    });
    await engine.open(quiz.id, 1, 'p1');
    await engine.answer({
      workspace_id: 'w1', quiz_id: quiz.id, question_id: q1.id,
      participant_id: 'u-1', choice_index: 0, idempotency_key: 'k1',
    });
    await expect(
      engine.answer({
        workspace_id: 'w1', quiz_id: quiz.id, question_id: q1.id,
        participant_id: 'u-1', choice_index: 1, idempotency_key: 'k2',
      }),
    ).rejects.toThrow(/already answered/);
  });

  it('rejects answers on closed quizzes', async () => {
    const quiz = await engine.create({
      workspace_id: 'w1', session_id: 's1', widget_id: 'w-1',
      title: 'Q', created_by: 'p1',
    });
    const q1 = await engine.addQuestion({
      workspace_id: 'w1', quiz_id: quiz.id,
      prompt: 'P', choices: [{ label: 'A' }, { label: 'B' }],
      correct_index: 0,
    });
    const opened = await engine.open(quiz.id, 1, 'p1');
    const closed = await engine.close(quiz.id, opened.version, 'p1');
    expect(closed.status).toBe('closed');
    await expect(
      engine.answer({
        workspace_id: 'w1', quiz_id: quiz.id, question_id: q1.id,
        participant_id: 'u-1', choice_index: 0, idempotency_key: 'k1',
      }),
    ).rejects.toThrow(/not open/);
  });

  it('rejects out-of-range choice', async () => {
    const quiz = await engine.create({
      workspace_id: 'w1', session_id: 's1', widget_id: 'w-1',
      title: 'Q', created_by: 'p1',
    });
    const q1 = await engine.addQuestion({
      workspace_id: 'w1', quiz_id: quiz.id,
      prompt: 'P', choices: [{ label: 'A' }, { label: 'B' }],
      correct_index: 0,
    });
    await engine.open(quiz.id, 1, 'p1');
    await expect(
      engine.answer({
        workspace_id: 'w1', quiz_id: quiz.id, question_id: q1.id,
        participant_id: 'u-1', choice_index: 5, idempotency_key: 'k1',
      }),
    ).rejects.toThrow(/out of range/);
  });

  it('idempotent answer replays return the same row', async () => {
    const quiz = await engine.create({
      workspace_id: 'w1', session_id: 's1', widget_id: 'w-1',
      title: 'Q', created_by: 'p1',
    });
    const q1 = await engine.addQuestion({
      workspace_id: 'w1', quiz_id: quiz.id,
      prompt: 'P', choices: [{ label: 'A' }, { label: 'B' }],
      correct_index: 0,
    });
    await engine.open(quiz.id, 1, 'p1');
    const a1 = await engine.answer({
      workspace_id: 'w1', quiz_id: quiz.id, question_id: q1.id,
      participant_id: 'u-1', choice_index: 0, idempotency_key: 'k1',
    });
    const a2 = await engine.answer({
      workspace_id: 'w1', quiz_id: quiz.id, question_id: q1.id,
      participant_id: 'u-1', choice_index: 0, idempotency_key: 'k1',
    });
    expect(a1.id).toBe(a2.id);
  });

  it('emits a verifiable audit chain', async () => {
    const quiz = await engine.create({
      workspace_id: 'w1', session_id: 's1', widget_id: 'w-1',
      title: 'Q', created_by: 'p1',
    });
    const q1 = await engine.addQuestion({
      workspace_id: 'w1', quiz_id: quiz.id,
      prompt: 'P', choices: [{ label: 'A' }, { label: 'B' }],
      correct_index: 0,
    });
    await engine.open(quiz.id, 1, 'p1');
    await engine.answer({
      workspace_id: 'w1', quiz_id: quiz.id, question_id: q1.id,
      participant_id: 'u-1', choice_index: 0, idempotency_key: 'k1',
    });
    const v = await audit.verify();
    expect(v.ok).toBe(true);
  });
});
