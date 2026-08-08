-- 0067_phase18_assignments.up.sql
-- Phase 18 W1: Task assignments with slide ranges and watchers.
--
-- Tables:
--   assignment           — one task assignment scoped to a slide range.
--   assignment_history   — append-only audit trail of status changes.
--
-- Watchers are stored as a uuid[] column on assignment (not a separate table).

BEGIN;

-- ---------------------------------------------------------------------------
-- assignment — one task assignment scoped to a slide range.
-- slide_range: int4range representing the inclusive slide indices [lo, hi).
-- primary_id: UUID of the user primarily responsible.
-- watchers: UUID array of users watching this assignment.
-- status: 'not_started' | 'in_progress' | 'blocked' | 'review' | 'done'
-- task_link_id: optional FK to an external task tracker (Jira/Linear/Asana).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assignment (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         uuid NOT NULL,
    deck_id              uuid NOT NULL,
    slide_range          int4range NOT NULL,
    primary_id           uuid NOT NULL,
    watchers             uuid[] NOT NULL DEFAULT '{}',
    status               text NOT NULL DEFAULT 'not_started'
                         CHECK (status IN ('not_started','in_progress','blocked','review','done')),
    blocked_reason       text,
    due_at               timestamptz,
    created_by           uuid NOT NULL,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    completed_at         timestamptz,
    task_link_id         uuid
);

CREATE INDEX IF NOT EXISTS assignment_workspace_idx ON assignment (workspace_id);
CREATE INDEX IF NOT EXISTS assignment_deck_idx ON assignment (deck_id);
CREATE INDEX IF NOT EXISTS assignment_primary_idx ON assignment (primary_id);
CREATE INDEX IF NOT EXISTS assignment_status_idx ON assignment (workspace_id, status);
CREATE INDEX IF NOT EXISTS assignment_due_idx ON assignment (due_at) WHERE due_at IS NOT NULL AND status NOT IN ('done');

-- ---------------------------------------------------------------------------
-- assignment_history — append-only audit trail of status changes.
-- Satisfies #181: reassignment preserves audit.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assignment_history (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         uuid NOT NULL,
    assignment_id        uuid NOT NULL REFERENCES assignment(id) ON DELETE CASCADE,
    actor_id             uuid NOT NULL,
    old_status           text,
    new_status           text NOT NULL,
    reason               text,
    created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assignment_history_workspace_idx ON assignment_history (workspace_id);
CREATE INDEX IF NOT EXISTS assignment_history_assignment_idx ON assignment_history (assignment_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'assignment',
        'assignment_history'
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
