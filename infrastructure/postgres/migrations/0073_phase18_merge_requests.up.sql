-- 0073_phase18_merge_requests.up.sql
-- Phase 18 W2: Merge requests + slide diffs for branch-based collaboration.
--
-- Tables:
--   slide_diff    — computed per-slide diffs between branches (created first).
--   merge_request — branch merge requests with diff linkage.

BEGIN;

-- ---------------------------------------------------------------------------
-- slide_diff — computed per-slide diffs between branches.
-- mr_id: FK to merge_request.id (created below).
-- base_version_id / target_version_id / source_version_id: version UUIDs.
-- slide_diffs: JSONB array of per-slide diff objects.
-- binding_diffs: JSONB array of per-binding diff objects.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS slide_diff (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         uuid NOT NULL,
    mr_id                uuid NOT NULL,
    base_version_id      uuid NOT NULL,
    target_version_id    uuid NOT NULL,
    source_version_id    uuid NOT NULL,
    slide_diffs          jsonb NOT NULL DEFAULT '[]'::jsonb,
    binding_diffs        jsonb NOT NULL DEFAULT '[]'::jsonb,
    computed_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS slide_diff_mr_idx ON slide_diff (mr_id);

-- ---------------------------------------------------------------------------
-- merge_request — branch merge requests for deck content.
-- source_branch / target_branch: branch names.
-- status: 'open' | 'approved' | 'merged' | 'closed' | 'conflict'
-- diff_id: logically FK to slide_diff.id (ON DELETE SET NULL).
-- merge_commit_id: UUID of the resulting commit after merge.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merge_request (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         uuid NOT NULL,
    deck_id              uuid NOT NULL,
    source_branch        text NOT NULL,
    target_branch        text NOT NULL,
    title                text NOT NULL,
    description          text,
    author_id            uuid NOT NULL,
    status               text NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open','approved','merged','closed','conflict')),
    diff_id              uuid,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    merged_at            timestamptz,
    merged_by            uuid,
    merge_commit_id      uuid
    -- diff_id is logically FK to slide_diff.id; explicit FK omitted for flexibility.
    -- When a slide_diff row is deleted, diff_id is set to NULL (ON DELETE SET NULL).
);

CREATE INDEX IF NOT EXISTS merge_request_deck_idx ON merge_request (deck_id);
CREATE INDEX IF NOT EXISTS merge_request_status_idx ON merge_request (status);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'slide_diff',
        'merge_request'
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
