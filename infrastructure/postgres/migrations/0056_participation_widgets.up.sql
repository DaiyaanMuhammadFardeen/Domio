-- Phase 16 W4-W8 — participation widget tables.
--
-- One file, eleven tables. Each widget engine owns one table per
-- (workspace, session, widget) tuple plus an idempotency record and an
-- audit trail. Every table is RLS-scoped to workspace_id; the engine
-- service holds the workspace key for the duration of a request and
-- drops it on completion.
--
-- RLS policies follow the @domio/rls policy naming: "{table}_workspace_isolation".
-- Indexes use the (workspace_id, session_id, widget_id) prefix so the
-- common access pattern — fan-out to widgets within a single session —
-- stays on a covering index.

BEGIN;

-- W4 — poll engine
CREATE TABLE IF NOT EXISTS poll (
  id              uuid        PRIMARY KEY,
  workspace_id    uuid        NOT NULL,
  session_id      uuid        NOT NULL,
  widget_id       text        NOT NULL,
  question        text        NOT NULL,
  options         jsonb       NOT NULL,
  status          text        NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'open', 'closed', 'archived')),
  opens_at_ms     bigint,
  closes_at_ms    bigint,
  results_visible boolean     NOT NULL DEFAULT false,
  created_by      text        NOT NULL,
  created_at_ms   bigint      NOT NULL,
  updated_at_ms   bigint      NOT NULL,
  version         bigint      NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS poll_session_widget
  ON poll (workspace_id, session_id, widget_id);
CREATE INDEX IF NOT EXISTS poll_session_status
  ON poll (workspace_id, session_id, status);

CREATE TABLE IF NOT EXISTS poll_vote (
  id              uuid        PRIMARY KEY,
  workspace_id    uuid        NOT NULL,
  session_id      uuid        NOT NULL,
  poll_id         uuid        NOT NULL REFERENCES poll(id) ON DELETE CASCADE,
  participant_id  text        NOT NULL,
  option_index    smallint    NOT NULL,
  cast_at_ms      bigint      NOT NULL,
  idempotency_key text        NOT NULL,
  UNIQUE (workspace_id, poll_id, participant_id),
  UNIQUE (workspace_id, session_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS poll_vote_aggregate
  ON poll_vote (workspace_id, poll_id, option_index);

-- W5 — word cloud engine
CREATE TABLE IF NOT EXISTS word_cloud (
  id              uuid        PRIMARY KEY,
  workspace_id    uuid        NOT NULL,
  session_id      uuid        NOT NULL,
  widget_id       text        NOT NULL,
  prompt          text        NOT NULL,
  status          text        NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'open', 'closed', 'archived')),
  allow_repeat    boolean     NOT NULL DEFAULT false,
  stopwords       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  max_chars       smallint    NOT NULL DEFAULT 32,
  created_by      text        NOT NULL,
  created_at_ms   bigint      NOT NULL,
  updated_at_ms   bigint      NOT NULL,
  version         bigint      NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS word_cloud_session
  ON word_cloud (workspace_id, session_id);

CREATE TABLE IF NOT EXISTS word_cloud_submit (
  id              uuid        PRIMARY KEY,
  workspace_id    uuid        NOT NULL,
  session_id      uuid        NOT NULL,
  cloud_id        uuid        NOT NULL REFERENCES word_cloud(id) ON DELETE CASCADE,
  participant_id  text        NOT NULL,
  raw_text        text        NOT NULL,
  tokens          jsonb       NOT NULL,
  moderation      text
                  CHECK (moderation IS NULL OR moderation IN ('allow', 'flag', 'block')),
  submitted_at_ms bigint      NOT NULL,
  idempotency_key text        NOT NULL,
  UNIQUE (workspace_id, session_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS word_cloud_submit_aggregate
  ON word_cloud_submit (workspace_id, cloud_id);

-- W5 — moderation
CREATE TABLE IF NOT EXISTS moderation_decision (
  id              uuid        PRIMARY KEY,
  workspace_id    uuid        NOT NULL,
  session_id      uuid        NOT NULL,
  subject_kind    text        NOT NULL
                  CHECK (subject_kind IN ('word_cloud_submit', 'qa_submit', 'poll_label')),
  subject_id      uuid        NOT NULL,
  decision        text        NOT NULL
                  CHECK (decision IN ('allow', 'flag', 'block')),
  source          text        NOT NULL
                  CHECK (source IN ('blocklist', 'ml', 'manual')),
  reason          text,
  decided_at_ms   bigint      NOT NULL,
  decided_by      text        NOT NULL
);
CREATE INDEX IF NOT EXISTS moderation_decision_subject
  ON moderation_decision (workspace_id, subject_kind, subject_id);

-- W6 — Q&A
CREATE TABLE IF NOT EXISTS qa_thread (
  id              uuid        PRIMARY KEY,
  workspace_id    uuid        NOT NULL,
  session_id      uuid        NOT NULL,
  widget_id       text        NOT NULL,
  status          text        NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'answered', 'deferred', 'archived')),
  created_by      text        NOT NULL,
  created_at_ms   bigint      NOT NULL,
  version         bigint      NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS qa_thread_session
  ON qa_thread (workspace_id, session_id, status);

CREATE TABLE IF NOT EXISTS qa_submit (
  id              uuid        PRIMARY KEY,
  workspace_id    uuid        NOT NULL,
  session_id      uuid        NOT NULL,
  thread_id       uuid        REFERENCES qa_thread(id) ON DELETE SET NULL,
  participant_id  text        NOT NULL,
  body            text        NOT NULL,
  moderation      text
                  CHECK (moderation IS NULL OR moderation IN ('allow', 'flag', 'block')),
  upvotes         integer     NOT NULL DEFAULT 0,
  submitted_at_ms bigint      NOT NULL,
  idempotency_key text        NOT NULL,
  UNIQUE (workspace_id, session_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS qa_submit_session
  ON qa_submit (workspace_id, session_id, submitted_at_ms DESC);

-- W7 — quiz
CREATE TABLE IF NOT EXISTS quiz (
  id              uuid        PRIMARY KEY,
  workspace_id    uuid        NOT NULL,
  session_id      uuid        NOT NULL,
  widget_id       text        NOT NULL,
  title           text        NOT NULL,
  status          text        NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'open', 'closed', 'archived')),
  server_clock    boolean     NOT NULL DEFAULT true,
  show_answers    boolean     NOT NULL DEFAULT false,
  opens_at_ms     bigint,
  closes_at_ms    bigint,
  created_by      text        NOT NULL,
  created_at_ms   bigint      NOT NULL,
  updated_at_ms   bigint      NOT NULL,
  version         bigint      NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS quiz_session
  ON quiz (workspace_id, session_id, status);

CREATE TABLE IF NOT EXISTS quiz_question (
  id              uuid        PRIMARY KEY,
  workspace_id    uuid        NOT NULL,
  quiz_id         uuid        NOT NULL REFERENCES quiz(id) ON DELETE CASCADE,
  position        smallint    NOT NULL,
  prompt          text        NOT NULL,
  choices         jsonb       NOT NULL,
  correct_index   smallint,
  points          smallint    NOT NULL DEFAULT 1,
  time_limit_ms   integer,
  UNIQUE (quiz_id, position)
);

CREATE TABLE IF NOT EXISTS quiz_answer (
  id              uuid        PRIMARY KEY,
  workspace_id    uuid        NOT NULL,
  session_id      uuid        NOT NULL,
  quiz_id         uuid        NOT NULL REFERENCES quiz(id) ON DELETE CASCADE,
  question_id     uuid        NOT NULL REFERENCES quiz_question(id) ON DELETE CASCADE,
  participant_id  text        NOT NULL,
  choice_index    smallint    NOT NULL,
  is_correct      boolean,
  points_awarded  smallint,
  answered_at_ms  bigint      NOT NULL,
  server_offset_ms integer,
  idempotency_key text        NOT NULL,
  UNIQUE (workspace_id, question_id, participant_id),
  UNIQUE (workspace_id, session_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS quiz_answer_leaderboard
  ON quiz_answer (workspace_id, quiz_id, participant_id, points_awarded DESC);

-- W8 — reaction, nav, sentiment, raise_hand
CREATE TABLE IF NOT EXISTS reaction (
  id              uuid        PRIMARY KEY,
  workspace_id    uuid        NOT NULL,
  session_id      uuid        NOT NULL,
  slide_id        text        NOT NULL,
  participant_id  text        NOT NULL,
  emoji           text        NOT NULL,
  posted_at_ms    bigint      NOT NULL,
  idempotency_key text        NOT NULL,
  UNIQUE (workspace_id, session_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS reaction_aggregate
  ON reaction (workspace_id, session_id, slide_id, emoji);

CREATE TABLE IF NOT EXISTS nav_vote (
  id              uuid        PRIMARY KEY,
  workspace_id    uuid        NOT NULL,
  session_id      uuid        NOT NULL,
  slide_id        text        NOT NULL,
  participant_id  text        NOT NULL,
  direction       text        NOT NULL
                  CHECK (direction IN ('next', 'previous', 'back')),
  voted_at_ms     bigint      NOT NULL,
  idempotency_key text        NOT NULL,
  UNIQUE (workspace_id, session_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS nav_vote_aggregate
  ON nav_vote (workspace_id, session_id, slide_id, direction);

CREATE TABLE IF NOT EXISTS sentiment_vote (
  id              uuid        PRIMARY KEY,
  workspace_id    uuid        NOT NULL,
  session_id      uuid        NOT NULL,
  slide_id        text        NOT NULL,
  participant_id  text        NOT NULL,
  score           smallint    NOT NULL
                  CHECK (score BETWEEN -2 AND 2),
  voted_at_ms     bigint      NOT NULL,
  idempotency_key text        NOT NULL,
  UNIQUE (workspace_id, session_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS sentiment_vote_aggregate
  ON sentiment_vote (workspace_id, session_id, slide_id);

CREATE TABLE IF NOT EXISTS raise_hand (
  id              uuid        PRIMARY KEY,
  workspace_id    uuid        NOT NULL,
  session_id      uuid        NOT NULL,
  participant_id  text        NOT NULL,
  status          text        NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued', 'called', 'dismissed', 'expired')),
  position        integer     NOT NULL,
  raised_at_ms    bigint      NOT NULL,
  resolved_at_ms  bigint,
  version         bigint      NOT NULL DEFAULT 1,
  UNIQUE (workspace_id, session_id, participant_id)
);
CREATE INDEX IF NOT EXISTS raise_hand_queue
  ON raise_hand (workspace_id, session_id, status, position);

-- Generic engagement counter (cached aggregates for recap)
CREATE TABLE IF NOT EXISTS widget_engagement_counter (
  workspace_id    uuid        NOT NULL,
  session_id      uuid        NOT NULL,
  widget_id       text        NOT NULL,
  kind            text        NOT NULL,
  count           bigint      NOT NULL DEFAULT 0,
  updated_at_ms   bigint      NOT NULL,
  PRIMARY KEY (workspace_id, session_id, widget_id, kind)
);

-- RLS
ALTER TABLE poll ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_vote ENABLE ROW LEVEL SECURITY;
ALTER TABLE word_cloud ENABLE ROW LEVEL SECURITY;
ALTER TABLE word_cloud_submit ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_decision ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_thread ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_submit ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_question ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_answer ENABLE ROW LEVEL SECURITY;
ALTER TABLE reaction ENABLE ROW LEVEL SECURITY;
ALTER TABLE nav_vote ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentiment_vote ENABLE ROW LEVEL SECURITY;
ALTER TABLE raise_hand ENABLE ROW LEVEL SECURITY;
ALTER TABLE widget_engagement_counter ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'poll','poll_vote','word_cloud','word_cloud_submit','moderation_decision',
    'qa_thread','qa_submit','quiz','quiz_question','quiz_answer',
    'reaction','nav_vote','sentiment_vote','raise_hand',
    'widget_engagement_counter'
  ]) LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (workspace_id = current_setting(''app.workspace_id'', true)::uuid)',
      t || '_workspace_isolation', t
    );
  END LOOP;
END $$;

COMMIT;
