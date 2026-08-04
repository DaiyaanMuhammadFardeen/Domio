-- 0032_phase10_quizzes.down.sql
-- Phase 10 (M6.1): Drop quizzes / attempts / answers / results / LLM review queue.

BEGIN;

DROP TABLE IF EXISTS llm_review_queue CASCADE;
DROP TABLE IF EXISTS quiz_result CASCADE;
DROP TABLE IF EXISTS quiz_answer CASCADE;
DROP TABLE IF EXISTS quiz_attempt CASCADE;
DROP TABLE IF EXISTS quiz CASCADE;

COMMIT;
