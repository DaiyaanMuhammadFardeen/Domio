-- Phase 16 W9 — drop closeout tables.
BEGIN;

DROP TRIGGER IF EXISTS trg_attendance_chain ON attendance_record;
DROP FUNCTION IF EXISTS attendance_record_chain_trigger();

DROP TABLE IF EXISTS recap_feedback_aggregation CASCADE;
DROP TABLE IF EXISTS feedback_response CASCADE;
DROP TABLE IF EXISTS translation_request CASCADE;
DROP TABLE IF EXISTS attendance_record CASCADE;
DROP TABLE IF EXISTS handout_link CASCADE;

COMMIT;
