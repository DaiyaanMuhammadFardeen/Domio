-- 0037_phase11_embed_maps_jobs.down.sql
-- Phase 11: Drop video_jobs, cad_jobs, map_style, latex_doc,
-- embed_policy, code_sandbox_policy. Reverse dependency order.

BEGIN;

DROP TABLE IF EXISTS video_jobs CASCADE;
DROP TABLE IF EXISTS cad_jobs CASCADE;
DROP TABLE IF EXISTS map_style CASCADE;
DROP TABLE IF EXISTS latex_doc CASCADE;
DROP TABLE IF EXISTS embed_policy CASCADE;
DROP TABLE IF EXISTS code_sandbox_policy CASCADE;

COMMIT;
