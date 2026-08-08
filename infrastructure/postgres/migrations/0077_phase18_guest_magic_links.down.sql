-- 0077_phase18_guest_magic_links.down.sql
-- Phase 18 W5: Drop guest_magic_link.
-- ---------------------------------------------------------------------------

BEGIN;

DROP TABLE IF EXISTS guest_magic_link CASCADE;

COMMIT;
