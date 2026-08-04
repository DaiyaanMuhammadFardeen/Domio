import { describe, expect, it } from 'vitest';
import { XapiEmitter, QUIZ_OBJECT_TYPE } from './xapi-emitter.js';

const ACTOR = { mbox: 'mailto:viewer@example.com', name: 'Viewer 1' };

describe('XapiEmitter — experienced', () => {
  it('emits an experienced statement on first sight', () => {
    const emitter = new XapiEmitter({ actor: ACTOR });
    const stmt = emitter.experienced({ quizId: 'q1', deckId: 'd1', attemptId: 'a1' }, 'Onboarding');
    expect(stmt.verb.id).toBe('http://adlnet.gov/expapi/verbs/experienced');
    expect(stmt.actor.mbox).toBe(ACTOR.mbox);
    expect(stmt.object.id).toBe('domio://quiz/q1');
    expect(stmt.object.definition.name['en-US']).toBe('Onboarding');
    expect(stmt.object.definition.type).toBe(QUIZ_OBJECT_TYPE);
    expect(stmt.version).toBe('1.0.3');
    expect(stmt.context?.registration).toBe('a1');
    expect(stmt.result?.completion).toBe(false);
    expect(emitter.list().length).toBe(1);
  });
});

describe('XapiEmitter — answered', () => {
  it('records response and success on each answer', () => {
    const emitter = new XapiEmitter({ actor: ACTOR });
    const stmt = emitter.answered(
      { quizId: 'q1', deckId: 'd1', attemptId: 'a1', questionId: 'q-q1', response: 'paris', correct: true },
      'Capital of France?',
    );
    expect(stmt.verb.id).toBe('http://adlnet.gov/expapi/verbs/answered');
    expect(stmt.result?.success).toBe(true);
    expect(stmt.result?.response).toBe('paris');
    expect(stmt.context?.extensions?.['https://domio.dev/xapi/quiz-id']).toBe('q1');
  });
});

describe('XapiEmitter — completed + passed/failed', () => {
  it('emits completed + passed when score ≥ threshold', () => {
    const emitter = new XapiEmitter({ actor: ACTOR });
    const statements = emitter.completed(
      { quizId: 'q1', deckId: 'd1', attemptId: 'a1' },
      'Onboarding',
      { raw: 9, min: 0, max: 10 },
      true,
      'PT45S',
    );
    expect(statements.length).toBe(2);
    expect(statements[0]!.verb.id).toBe('http://adlnet.gov/expapi/verbs/completed');
    expect(statements[1]!.verb.id).toBe('http://adlnet.gov/expapi/verbs/passed');
    expect(statements[0]!.result?.duration).toBe('PT45S');
    expect(statements[0]!.result?.completion).toBe(true);
  });

  it('emits completed + failed when score < threshold', () => {
    const emitter = new XapiEmitter({ actor: ACTOR });
    const statements = emitter.completed(
      { quizId: 'q1', deckId: 'd1', attemptId: 'a1' },
      'Onboarding',
      { raw: 4, min: 0, max: 10 },
      false,
    );
    expect(statements[1]!.verb.id).toBe('http://adlnet.gov/expapi/verbs/failed');
    expect(statements[1]!.result?.success).toBe(false);
  });
});

describe('XapiEmitter — replayability', () => {
  it('produces stable statements replayable by an LRS', () => {
    const emitter = new XapiEmitter({ actor: ACTOR });
    emitter.experienced({ quizId: 'q1', deckId: 'd1', attemptId: 'a1' }, 'Onboarding');
    emitter.answered(
      { quizId: 'q1', deckId: 'd1', attemptId: 'a1', questionId: 'q-1', response: 'paris', correct: true },
      'Q1?',
    );
    emitter.answered(
      { quizId: 'q1', deckId: 'd1', attemptId: 'a1', questionId: 'q-2', response: 'true', correct: false },
      'Q2?',
    );
    emitter.completed(
      { quizId: 'q1', deckId: 'd1', attemptId: 'a1' },
      'Onboarding',
      { raw: 1, min: 0, max: 2 },
      false,
    );

    const stmts = emitter.list();
    expect(stmts.length).toBe(5);
    // All statements must carry the same actor and registration.
    for (const s of stmts) {
      expect(s.actor.mbox).toBe(ACTOR.mbox);
      expect(s.context?.registration).toBe('a1');
      expect(s.version).toBe('1.0.3');
      expect(s.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
    // Verbs in order: experienced, answered, answered, completed, failed.
    expect(stmts.map((s) => s.verb.id)).toEqual([
      'http://adlnet.gov/expapi/verbs/experienced',
      'http://adlnet.gov/expapi/verbs/answered',
      'http://adlnet.gov/expapi/verbs/answered',
      'http://adlnet.gov/expapi/verbs/completed',
      'http://adlnet.gov/expapi/verbs/failed',
    ]);
  });
});

describe('XapiEmitter — authority + reset', () => {
  it('includes the authority when supplied', () => {
    const emitter = new XapiEmitter({
      actor: ACTOR,
      authority: { mbox: 'mailto:lrs@domio.dev', name: 'LRS' },
    });
    const stmt = emitter.experienced({ quizId: 'q1', deckId: 'd1' }, 'Q');
    expect(stmt.authority?.mbox).toBe('mailto:lrs@domio.dev');
  });

  it('reset() clears the buffer', () => {
    const emitter = new XapiEmitter({ actor: ACTOR });
    emitter.experienced({ quizId: 'q1', deckId: 'd1' }, 'Q');
    expect(emitter.list().length).toBe(1);
    emitter.reset();
    expect(emitter.list().length).toBe(0);
  });
});