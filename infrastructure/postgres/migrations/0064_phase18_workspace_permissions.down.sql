-- 0064_phase18_workspace_permissions.down.sql
-- Drop workspace + membership + group + permission tables in reverse dependency order.

BEGIN;

DROP TABLE IF EXISTS permission_grant CASCADE;
DROP TABLE IF EXISTS group_member CASCADE;
DROP TABLE IF EXISTS workspace_member CASCADE;
DROP TABLE IF EXISTS workspace CASCADE;

COMMIT;
