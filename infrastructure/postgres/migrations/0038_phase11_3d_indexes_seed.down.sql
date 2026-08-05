-- 0038_phase11_3d_indexes_seed.down.sql
-- Phase 11: remove seeded shader presets and default licenses.

BEGIN;

DELETE FROM shader WHERE tenant_id = 'system';
DELETE FROM license WHERE tenant_id = 'system';

COMMIT;
