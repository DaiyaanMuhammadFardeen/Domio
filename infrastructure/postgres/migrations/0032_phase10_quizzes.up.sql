-- 0032_phase10_quizzes.up.sql
-- Phase 10 (M6.1): Quiz runtime — quizzes, attempts, answers, results,
-- and the LLM-review queue. Tenant isolation via current_setting('app.tenant_id'),
-- matching 0003/0021/0023/0025.

BEGIN;

-- Quiz: a deck-level assessment with one or more questions.
CREATE TABLE IF NOT EXISTS quiz (
    id              text PRIMARY KEY,
    tenant_id       text NOT NULL,
    deck_id         text NOT NULL,
    name            text NOT NULL,
    questions       jsonb NOT NULL,
    pass_threshold  numeric,
    version         integer NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- QuizAttempt: a viewer's attempt at a quiz.
CREATE TABLE IF NOT EXISTS quiz_attempt (
    id                  text PRIMARY KEY,
    tenant_id           text NOT NULL,
    deck_id             text NOT NULL,
    quiz_id             text NOT NULL,
    seed                text NOT NULL,
    viewer_id           text NOT NULL,
    started_at          timestamptz NOT NULL DEFAULT now(),
    completed_at        timestamptz,
    status              text NOT NULL DEFAULT 'in_progress'
                          CHECK (status IN ('in_progress','completed','abandoned')),
    current_question_id text,
    score               numeric NOT NULL DEFAULT 0,
    passed              boolean
);

-- QuizAnswer: a single answer submitted within an attempt.
CREATE TABLE IF NOT EXISTS quiz_answer (
    id                   text PRIMARY KEY,
    tenant_id            text NOT NULL,
    attempt_id           text NOT NULL,
    question_id          text NOT NULL,
    value                jsonb NOT NULL,
    correct              boolean NOT NULL,
    score                numeric NOT NULL,
    confidence           numeric,
    needs_human_review   boolean NOT NULL DEFAULT false,
    submitted_at         timestamptz NOT NULL DEFAULT now()
);

-- QuizResult: aggregate score / pass outcome.
CREATE TABLE IF NOT EXISTS quiz_result (
    id            text PRIMARY KEY,
    tenant_id     text NOT NULL,
    attempt_id    text NOT NULL UNIQUE,
    quiz_id       text NOT NULL,
    total_score   numeric NOT NULL,
    max_score     numeric NOT NULL,
    percentage    numeric NOT NULL,
    passed        boolean NOT NULL,
    answers       jsonb NOT NULL,
    completed_at  timestamptz NOT NULL DEFAULT now()
);

-- LlmReviewQueueItem: low-confidence LLM-graded short-answer awaiting
-- human review. Reviewer can override the score and mark the row resolved.
CREATE TABLE IF NOT EXISTS llm_review_queue (
    id                text PRIMARY KEY,
    tenant_id         text NOT NULL,
    deck_id           text NOT NULL,
    quiz_id           text NOT NULL,
    attempt_id        text NOT NULL,
    question_id       text NOT NULL,
    submitted_answer  text NOT NULL,
    llm_confidence    numeric NOT NULL,
    llm_reason        text NOT NULL DEFAULT '',
    status            text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','rejected','overridden')),
    reviewer_id       text,
    override_score    numeric,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Indexes for the hot lookup paths.
CREATE INDEX IF NOT EXISTS quiz_deck_idx
    ON quiz (tenant_id, deck_id);

CREATE INDEX IF NOT EXISTS quiz_attempt_quiz_idx
    ON quiz_attempt (tenant_id, quiz_id);

CREATE INDEX IF NOT EXISTS quiz_attempt_viewer_idx
    ON quiz_attempt (tenant_id, viewer_id);

CREATE INDEX IF NOT EXISTS quiz_answer_attempt_idx
    ON quiz_answer (tenant_id, attempt_id);

CREATE INDEX IF NOT EXISTS llm_review_queue_status_idx
    ON llm_review_queue (tenant_id, status)
    WHERE status = 'pending';

-- RLS: enable + tenant_isolation policy on every M6.1 table.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['quiz','quiz_attempt','quiz_answer','quiz_result','llm_review_queue']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (
         tenant_id = current_setting(''app.tenant_id'', true)
         OR current_setting(''app.bypass_rls'', true) = ''on''
       ) WITH CHECK (
         tenant_id = current_setting(''app.tenant_id'', true)
         OR current_setting(''app.bypass_rls'', true) = ''on''
       )',
      t || '_tenant_isolation', t);
  END LOOP;
END $$;

COMMIT;
