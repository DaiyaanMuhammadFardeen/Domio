-- 0039_phase12_ai_copilot.down.sql
-- Phase 12: Drop all 12 AI copilot tables.
-- Reverse FK dependency order.

BEGIN;

DROP TABLE IF EXISTS semantic_index_entry CASCADE;
DROP TABLE IF EXISTS ai_freshness_record CASCADE;
DROP TABLE IF EXISTS audience_variant CASCADE;
DROP TABLE IF EXISTS summary CASCADE;
DROP TABLE IF EXISTS qa_pair CASCADE;
DROP TABLE IF EXISTS rehearsal_session CASCADE;
DROP TABLE IF EXISTS image_generation_request CASCADE;
DROP TABLE IF EXISTS slide_citation CASCADE;
DROP TABLE IF EXISTS citation CASCADE;
DROP TABLE IF EXISTS ai_run CASCADE;
DROP TABLE IF EXISTS ai_job CASCADE;
DROP TABLE IF EXISTS source CASCADE;

COMMIT;
