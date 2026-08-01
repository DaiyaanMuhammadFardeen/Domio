-- Migration 0004: CRDT logs & branch heads for realtime collaboration.
-- Implements Phase 04 CRDT foundation: crdt_logs (append-only event log)
-- and branch_heads (latest HLC per branch per deck).

BEGIN;

-- ---------------------------------------------------------------------------
-- crdt_logs — append-only event store for CRDT operations.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crdt_logs (
    op_id                text PRIMARY KEY,
    deck_id              text NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    branch_id            text NOT NULL DEFAULT 'main',
    slide_id             text,
    author_id            text NOT NULL,
    hlc_physical         bigint NOT NULL,
    hlc_logical          bigint NOT NULL,
    parent_hlc_physical  bigint,
    parent_hlc_logical   bigint,
    op_type              text NOT NULL,
    payload              bytea NOT NULL,
    metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,
    applied_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crdt_logs_deck_branch_idx
    ON crdt_logs (deck_id, branch_id, hlc_physical, hlc_logical);
CREATE INDEX IF NOT EXISTS crdt_logs_deck_slide_idx
    ON crdt_logs (deck_id, slide_id)
    WHERE slide_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- branch_heads — latest HLC per branch per deck.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS branch_heads (
    deck_id       text NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    branch_id     text NOT NULL DEFAULT 'main',
    hlc_physical  bigint NOT NULL,
    hlc_logical   bigint NOT NULL,
    updated_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (deck_id, branch_id)
);

-- ---------------------------------------------------------------------------
-- Row-level security (RLS) policies — tenant isolation via decks join.
-- ---------------------------------------------------------------------------
ALTER TABLE crdt_logs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_heads ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'crdt_logs_tenant_isolation'
    ) THEN
        CREATE POLICY crdt_logs_tenant_isolation ON crdt_logs
            USING (
                EXISTS (
                    SELECT 1 FROM decks
                    WHERE decks.id = crdt_logs.deck_id
                      AND decks.tenant_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM decks
                    WHERE decks.id = crdt_logs.deck_id
                      AND decks.tenant_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'branch_heads_tenant_isolation'
    ) THEN
        CREATE POLICY branch_heads_tenant_isolation ON branch_heads
            USING (
                EXISTS (
                    SELECT 1 FROM decks
                    WHERE decks.id = branch_heads.deck_id
                      AND decks.tenant_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM decks
                    WHERE decks.id = branch_heads.deck_id
                      AND decks.tenant_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            );
    END IF;
END
$$;

COMMIT;
