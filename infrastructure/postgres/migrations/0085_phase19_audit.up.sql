-- 0085_phase19_audit.up.sql
-- Phase 19 WS-MKT-9: Marketplace hash-chained audit log.
--
-- Tables:
--   marketplace_audit_event — append-only, hash-chained audit log for all
--     marketplace financial and trust events. Mirrors the agent_audit_event
--     shape from 0040_phase13_mcp.up.sql (HMAC-SHA256, prev_hash linkage).
--
-- Chain key: (workspace_id, event_kind, seq) — each event_kind is an
--   independent chain within a workspace.
-- RLS: workspace-scoped (tenant isolation via workspace_id).
-- ---------------------------------------------------------------------------

BEGIN;

-- ---------------------------------------------------------------------------
-- marketplace_audit_event — append-only, hash-chained audit log.
-- Mirrors agent_audit_event (0040) with marketplace-specific event_kind enum.
--
-- workspace_id: tenant isolation (uuid, consistent with P13/P18 convention).
-- actor_id: the user/agent who triggered the event.
-- actor_type: 'user' | 'agent' | 'system' — high-level actor category.
-- actor_kind: 'human' | 'agent' — fine-grained; 'agent' for MCP purchases.
-- event_kind: marketplace-specific event classification (CHECK enum).
-- event_type: specific sub-type within the event_kind (free-form text).
-- seq: monotonic per (workspace_id, event_kind) chain.
-- prev_hash: hash of the previous event in this chain (genesis = SHA256("")).
-- hash: HMAC-SHA256 over canonical(payload || seq || prev_hash).
-- kid: HMAC key id used to sign this event.
-- recorded_at: when the event was recorded (append-only timestamp).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketplace_audit_event (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    uuid NOT NULL,
    actor_id        uuid NOT NULL,
    actor_type      text NOT NULL DEFAULT 'user'
                    CHECK (actor_type IN ('user', 'agent', 'system')),
    actor_kind      text NOT NULL DEFAULT 'human'
                    CHECK (actor_kind IN ('human', 'agent')),
    event_kind      text NOT NULL
                    CHECK (event_kind IN (
                        'purchase', 'refund', 'payout', 'takedown', 'kyc',
                        'brand_lock_curation', 'agent_purchase'
                    )),
    event_type      text NOT NULL,
    payload         jsonb NOT NULL,
    seq             bigint NOT NULL,
    prev_hash       text NOT NULL,
    hash            text NOT NULL,
    kid             text NOT NULL,
    recorded_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, event_kind, seq),
    UNIQUE (workspace_id, event_kind, hash)
);

CREATE INDEX IF NOT EXISTS marketplace_audit_event_workspace_recorded_idx
    ON marketplace_audit_event (workspace_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_audit_event_actor_idx
    ON marketplace_audit_event (actor_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_audit_event_kind_idx
    ON marketplace_audit_event (event_kind, recorded_at DESC);

-- ---------------------------------------------------------------------------
-- RLS — workspace-scoped (same pattern as agent_audit_event in 0040).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'marketplace_audit_event'
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
