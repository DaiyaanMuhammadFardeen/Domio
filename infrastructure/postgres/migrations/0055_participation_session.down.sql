-- 0055_participation_session.down.sql
BEGIN;
DROP TABLE IF EXISTS audience_audit_event CASCADE;
DROP TABLE IF EXISTS audience_idempotency CASCADE;
DROP TRIGGER IF EXISTS participant_session_membership_trg ON participant_session;
DROP FUNCTION IF EXISTS session_membership_upsert();
DROP TABLE IF EXISTS session_membership CASCADE;
DROP TABLE IF EXISTS participant_session CASCADE;
COMMIT;