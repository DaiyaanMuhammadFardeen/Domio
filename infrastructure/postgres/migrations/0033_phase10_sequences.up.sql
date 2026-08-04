-- 0033_phase10_sequences.up.sql
-- Phase 10 (M6.2): Presentation sequences — auto-advance timelines
-- with pause/resume, interruption policies, visibility-aware clock
-- handling, and reduced-motion default-off.
-- Tenant isolation via current_setting('app.tenant_id'), matching 0025.

BEGIN;

-- PresentationSequence: an ordered list of slides that auto-advances
-- on a fixed interval, with optional loop, count cap, pause_warn
-- threshold, and an interruption policy (ignore | queue | abort).
CREATE TABLE IF NOT EXISTS presentation_sequence (
    id                         text PRIMARY KEY,
    tenant_id                  text NOT NULL,
    deck_id                    text NOT NULL,
    name                       text NOT NULL,
    slides                     text[] NOT NULL,
    interval_ms                integer NOT NULL,
    pause_on_event             boolean NOT NULL DEFAULT false,
    loop                       boolean NOT NULL DEFAULT false,
    count                      integer NOT NULL DEFAULT 1,
    interruption_policy        text NOT NULL DEFAULT 'queue'
                                 CHECK (interruption_policy IN ('ignore','queue','abort')),
    reduced_motion_default_off boolean NOT NULL DEFAULT true,
    pause_warn_at_ms           integer NOT NULL DEFAULT 1800000,
    version                    integer NOT NULL DEFAULT 0,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    updated_at                 timestamptz NOT NULL DEFAULT now()
);

-- Indexes for the hot lookup paths.
CREATE INDEX IF NOT EXISTS presentation_sequence_deck_idx
    ON presentation_sequence (tenant_id, deck_id);

-- RLS: enable + tenant_isolation policy.
ALTER TABLE presentation_sequence ENABLE ROW LEVEL SECURITY;
CREATE POLICY presentation_sequence_tenant_isolation ON presentation_sequence
    USING (
        tenant_id = current_setting('app.tenant_id', true)
        OR current_setting('app.bypass_rls', true) = 'on'
    )
    WITH CHECK (
        tenant_id = current_setting('app.tenant_id', true)
        OR current_setting('app.bypass_rls', true) = 'on'
    );

COMMIT;