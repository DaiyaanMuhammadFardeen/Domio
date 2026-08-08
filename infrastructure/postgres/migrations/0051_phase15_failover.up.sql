-- 0051_phase15_failover.up.sql
-- Phase 15 W12: Failover — primary device dies, paired phone resumes in
-- ≤5 s p95. State is replicated over WebRTC every 250 ms + control-plane
-- relay. Encrypted to the paired device's long-lived key (Curve25519).
--
-- Tables:
--   failover_state — one row per session. replicated_state is the last
--                    snapshot sent to the paired device.

BEGIN;

CREATE TABLE IF NOT EXISTS failover_state (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id          uuid NOT NULL,
    presenter_session_id  uuid NOT NULL REFERENCES presenter_session (id) ON DELETE CASCADE,
    primary_device_id     text NOT NULL,
    paired_device_id      text,
    primary_pubkey        bytea,
    paired_pubkey         bytea,
    last_heartbeat_at     timestamptz,
    heartbeat_misses      integer NOT NULL DEFAULT 0,
    replicated_state      jsonb NOT NULL DEFAULT '{}'::jsonb,
    last_replicated_at    timestamptz,
    recovery_started_at   timestamptz,
    recovery_completed_at timestamptz,
    recovery_result       text
                          CHECK (recovery_result IS NULL OR recovery_result IN ('success','failure','cancelled')),
    encrypted_to_paired   boolean NOT NULL DEFAULT true,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid,
    updated_by            uuid,
    ai_run_id             uuid,
    agent_session_id      uuid,
    UNIQUE (presenter_session_id)
);

CREATE INDEX IF NOT EXISTS failover_state_workspace_idx
    ON failover_state (workspace_id);
CREATE INDEX IF NOT EXISTS failover_state_heartbeat_idx
    ON failover_state (last_heartbeat_at) WHERE recovery_result IS NULL;

DO $$
DECLARE
    t text := 'failover_state';
BEGIN
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
END $$;

COMMIT;