-- 0069_phase18_library.down.sql
-- Drop library tables in reverse dependency order.

BEGIN;

DROP TABLE IF EXISTS library_version CASCADE;
DROP TABLE IF EXISTS slide_library_entry CASCADE;

COMMIT;
