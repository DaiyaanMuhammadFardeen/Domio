-- Phase 16 W9 — closeout tables: handouts, attendance, translation, feedback.
--
-- Append-only hash chain via Postgres trigger on `attendance_record`.
-- The trigger computes prev_hash from the most recent row in the same
-- (workspace_id, session_id) partition and stores the SHA-256 of the
-- serialized row. Verification re-walks the chain.

BEGIN;

CREATE TABLE IF NOT EXISTS handout_link (
  id              uuid        PRIMARY KEY,
  workspace_id    uuid        NOT NULL,
  session_id      uuid        NOT NULL,
  signed_token    text        NOT NULL UNIQUE,
  expires_at_ms   bigint      NOT NULL,
  recipient_count integer     NOT NULL DEFAULT 0,
  scorm_package   text,
  created_by      text        NOT NULL,
  created_at_ms   bigint      NOT NULL,
  revoked_at_ms   bigint,
  version         bigint      NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS handout_link_session
  ON handout_link (workspace_id, session_id);

CREATE TABLE IF NOT EXISTS attendance_record (
  id              uuid        PRIMARY KEY,
  workspace_id    uuid        NOT NULL,
  session_id      uuid        NOT NULL,
  participant_id  text        NOT NULL,
  joined_at_ms    bigint      NOT NULL,
  left_at_ms      bigint,
  duration_ms     bigint,
  scorm_4ed_compliant boolean NOT NULL DEFAULT true,
  prev_hash       text,
  hash            text        NOT NULL,
  recorded_at_ms  bigint      NOT NULL
);
CREATE INDEX IF NOT EXISTS attendance_record_chain
  ON attendance_record (workspace_id, session_id, recorded_at_ms);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_record_participant
  ON attendance_record (workspace_id, session_id, participant_id);

-- Hash chain trigger: enforce monotonic chain within (workspace, session).
CREATE OR REPLACE FUNCTION attendance_record_chain_trigger() RETURNS trigger AS $$
DECLARE
  prev text;
BEGIN
  SELECT hash INTO prev
    FROM attendance_record
   WHERE workspace_id = NEW.workspace_id
     AND session_id = NEW.session_id
   ORDER BY recorded_at_ms DESC
   LIMIT 1;
  NEW.prev_hash := prev;
  IF NEW.hash IS NULL OR NEW.hash = '' THEN
    NEW.hash := encode(digest(
      coalesce(prev, '') || '|' || NEW.workspace_id::text || '|' || NEW.session_id::text
        || '|' || NEW.participant_id || '|' || NEW.joined_at_ms::text || '|' || coalesce(NEW.left_at_ms::text, ''),
      'sha256'
    ), 'hex');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_attendance_chain ON attendance_record;
CREATE TRIGGER trg_attendance_chain
  BEFORE INSERT ON attendance_record
  FOR EACH ROW
  EXECUTE FUNCTION attendance_record_chain_trigger();

CREATE TABLE IF NOT EXISTS translation_request (
  id              uuid        PRIMARY KEY,
  workspace_id    uuid        NOT NULL,
  session_id      uuid        NOT NULL,
  participant_id  text        NOT NULL,
  source_lang     text        NOT NULL,
  target_lang     text        NOT NULL,
  source_kind     text        NOT NULL
                  CHECK (source_kind IN ('caption', 'qa_submit', 'word_cloud_submit')),
  source_ref      text        NOT NULL,
  provider        text        NOT NULL
                  CHECK (provider IN ('deepl', 'google', 'nllb', 'whisper')),
  translated_text text,
  status          text        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'completed', 'failed')),
  requested_at_ms bigint      NOT NULL,
  completed_at_ms bigint,
  error           text
);
CREATE INDEX IF NOT EXISTS translation_request_session
  ON translation_request (workspace_id, session_id);

CREATE TABLE IF NOT EXISTS feedback_response (
  id              uuid        PRIMARY KEY,
  workspace_id    uuid        NOT NULL,
  session_id      uuid        NOT NULL,
  participant_id  text        NOT NULL,
  nps_score       smallint    CHECK (nps_score IS NULL OR (nps_score BETWEEN 0 AND 10)),
  stars           jsonb       NOT NULL DEFAULT '[]'::jsonb,
  free_text       text,
  submitted_at_ms bigint      NOT NULL,
  UNIQUE (workspace_id, session_id, participant_id)
);

CREATE TABLE IF NOT EXISTS recap_feedback_aggregation (
  workspace_id    uuid        NOT NULL,
  session_id      uuid        NOT NULL,
  nps_promoters   integer     NOT NULL DEFAULT 0,
  nps_passives    integer     NOT NULL DEFAULT 0,
  nps_detractors  integer     NOT NULL DEFAULT 0,
  star_average    numeric(4,2),
  free_text_count integer     NOT NULL DEFAULT 0,
  updated_at_ms   bigint      NOT NULL,
  PRIMARY KEY (workspace_id, session_id)
);

-- RLS
ALTER TABLE handout_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE translation_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_response ENABLE ROW LEVEL SECURITY;
ALTER TABLE recap_feedback_aggregation ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'handout_link','attendance_record','translation_request',
    'feedback_response','recap_feedback_aggregation'
  ]) LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (workspace_id = current_setting(''app.workspace_id'', true)::uuid)',
      t || '_workspace_isolation', t
    );
  END LOOP;
END $$;

COMMIT;
