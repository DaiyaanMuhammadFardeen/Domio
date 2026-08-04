-- 0033_phase10_sequences.down.sql
-- Phase 10 (M6.2): Drop presentation sequences.

BEGIN;

DROP TABLE IF EXISTS presentation_sequence CASCADE;

COMMIT;