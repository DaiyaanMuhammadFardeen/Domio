-- 0075_phase18_calendar.up.sql
-- Phase 18 W4: Calendar link — schedule integration for decks.
--
-- Tables:
--   calendar_link — links a deck to an external calendar event.

BEGIN;

-- ---------------------------------------------------------------------------
-- calendar_link — links a deck to a calendar vendor event.
-- vendor: 'google' | 'outlook' | 'icloud'
-- event_id: vendor-specific event identifier.
-- is_recurring / recurrence_id: support for recurring events.
-- last_synced_at: timestamp of last sync with the vendor.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS calendar_link (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         uuid NOT NULL,
    deck_id              uuid NOT NULL,
    user_id              uuid NOT NULL,
    vendor               text NOT NULL
                         CHECK (vendor IN ('google','outlook','icloud')),
    event_id             text NOT NULL,
    event_start_at       timestamptz NOT NULL,
    is_recurring         boolean NOT NULL DEFAULT false,
    recurrence_id        text,
    last_synced_at       timestamptz NOT NULL DEFAULT now(),
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid
);

CREATE INDEX IF NOT EXISTS calendar_link_deck_idx ON calendar_link (deck_id);
CREATE INDEX IF NOT EXISTS calendar_link_user_idx ON calendar_link (user_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'calendar_link'
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
