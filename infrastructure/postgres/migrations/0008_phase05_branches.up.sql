-- Migration 0008: Phase 05 branches — new branches table for deck
-- versioning and branching. Tracks branch metadata, lineage, and status.
--
-- The main branch is implicit (created with every deck); this table
-- stores user-created branches that fork from main or other branches.

BEGIN;

-- ---------------------------------------------------------------------------
-- branches — deck branches for versioning and isolated editing.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS branches (
    id                 text PRIMARY KEY,
    deck_id            text NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    name               text NOT NULL,
    parent_branch_id   text NOT NULL DEFAULT 'main',
    status             text NOT NULL DEFAULT 'active',
    head_revision      bigint NOT NULL DEFAULT 0,
    base_checkpoint_id text,
    created_by         text NOT NULL,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    UNIQUE (deck_id, name)
);

CREATE INDEX IF NOT EXISTS branches_deck_idx
    ON branches (deck_id, status);

-- ---------------------------------------------------------------------------
-- Row-level security (RLS) policies — tenant isolation via decks join.
-- Matches the pattern from 0004/0005.
-- ---------------------------------------------------------------------------
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'branches_tenant_isolation'
    ) THEN
        CREATE POLICY branches_tenant_isolation ON branches
            USING (
                EXISTS (
                    SELECT 1 FROM decks
                    WHERE decks.id = branches.deck_id
                      AND decks.tenant_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM decks
                    WHERE decks.id = branches.deck_id
                      AND decks.tenant_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            );
    END IF;
END
$$;

COMMIT;
