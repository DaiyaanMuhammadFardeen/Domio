-- 0078_phase18_reassignment_history.up.sql
-- Phase 18 W5: Assignment reassignment history — append-only audit trail.
--
-- Tables:
--   reassignment_history — one row per primary-assignee change on an
--                          assignment. Preserves audit continuity across
--                          reassignments (old_primary_id -> new_primary_id).
-- ---------------------------------------------------------------------------

BEGIN;

CREATE TABLE IF NOT EXISTS reassignment_history (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    uuid NOT NULL,
    assignment_id   uuid NOT NULL REFERENCES assignment(id) ON DELETE CASCADE,
    old_primary_id  uuid,
    new_primary_id  uuid NOT NULL,
    actor_id        uuid NOT NULL,
    reason          text,
    changed_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reassignment_history_assignment_idx ON reassignment_history (assignment_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'reassignment_history'
    ] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = t
              AND policyname = t || '_tenant_isolation'
        ) THEN
            EXECUTE format(
                'CREATE POLICY %I ON %I USING (
                    workspace_id::text = current_setting(''app.tenant_id'', true)
                    OR current_setting(''app.bypass_rls'', true) = ''on''
                ) WITH CHECK (
                    workspace_id::text = current_setting(''app.tenant_id'', true)
                    OR current_setting(''app.bypass_rls'', true) = ''on''
                )',
                t || '_tenant_isolation', t
            );
        END IF;
    END LOOP;
END $$;

COMMIT;
