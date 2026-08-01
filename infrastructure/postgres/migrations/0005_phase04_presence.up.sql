-- Migration 0005: presence sessions for realtime collaboration.
-- Tracks active editing sessions per deck for cursor/presence sharing.

BEGIN;

-- ---------------------------------------------------------------------------
-- presence_sessions — active user sessions per deck.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS presence_sessions (
    session_id    text PRIMARY KEY,
    deck_id       text NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    user_id       text NOT NULL,
    branch_id     text NOT NULL DEFAULT 'main',
    color         text NOT NULL,
    connection_id text NOT NULL,
    last_seen_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS presence_deck_idx
    ON presence_sessions (deck_id, last_seen_at DESC);

-- ---------------------------------------------------------------------------
-- Row-level security (RLS) policies — tenant isolation via decks join.
-- ---------------------------------------------------------------------------
ALTER TABLE presence_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'presence_sessions_tenant_isolation'
    ) THEN
        CREATE POLICY presence_sessions_tenant_isolation ON presence_sessions
            USING (
                EXISTS (
                    SELECT 1 FROM decks
                    WHERE decks.id = presence_sessions.deck_id
                      AND decks.tenant_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM decks
                    WHERE decks.id = presence_sessions.deck_id
                      AND decks.tenant_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            );
    END IF;
END
$$;

COMMIT;
