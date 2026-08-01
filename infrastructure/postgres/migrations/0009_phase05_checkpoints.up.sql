-- Migration 0009: Phase 05 checkpoints and merge requests — new tables
-- for version history (named/auto checkpoints) and merge request lifecycle.
--
-- checkpoints: pinned revisions for non-destructive restore.
-- merge_requests: 3-way diff, conflict resolution, and merge commit.

BEGIN;

-- ---------------------------------------------------------------------------
-- checkpoints — named and auto-checkpoints for deck version history.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS checkpoints (
    id           text PRIMARY KEY,
    deck_id      text NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    branch_id    text NOT NULL DEFAULT 'main',
    name         text NOT NULL,
    revision     bigint NOT NULL,
    parent_id    text,
    created_by   text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    kind         text NOT NULL DEFAULT 'named',
    UNIQUE (deck_id, branch_id, name)
);

CREATE INDEX IF NOT EXISTS checkpoints_deck_branch_idx
    ON checkpoints (deck_id, branch_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- merge_requests — 3-way diff, conflict resolution, and merge lifecycle.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merge_requests (
    id                   text PRIMARY KEY,
    deck_id              text NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    source_branch_id     text NOT NULL,
    target_branch_id     text NOT NULL,
    status               text NOT NULL DEFAULT 'open',
    source_revision      bigint,
    target_revision      bigint,
    base_revision        bigint,
    diff_summary         jsonb,
    resolution_strategy  text,
    resolved_by          text,
    resolved_at          timestamptz,
    created_by           text NOT NULL,
    created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS merge_requests_deck_status_idx
    ON merge_requests (deck_id, status);

-- ---------------------------------------------------------------------------
-- Row-level security (RLS) policies — tenant isolation via decks join.
-- Matches the pattern from 0004/0005/0008.
-- ---------------------------------------------------------------------------
ALTER TABLE checkpoints     ENABLE ROW LEVEL SECURITY;
ALTER TABLE merge_requests  ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'checkpoints_tenant_isolation'
    ) THEN
        CREATE POLICY checkpoints_tenant_isolation ON checkpoints
            USING (
                EXISTS (
                    SELECT 1 FROM decks
                    WHERE decks.id = checkpoints.deck_id
                      AND decks.tenant_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM decks
                    WHERE decks.id = checkpoints.deck_id
                      AND decks.tenant_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'merge_requests_tenant_isolation'
    ) THEN
        CREATE POLICY merge_requests_tenant_isolation ON merge_requests
            USING (
                EXISTS (
                    SELECT 1 FROM decks
                    WHERE decks.id = merge_requests.deck_id
                      AND decks.tenant_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM decks
                    WHERE decks.id = merge_requests.deck_id
                      AND decks.tenant_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            );
    END IF;
END
$$;

COMMIT;
