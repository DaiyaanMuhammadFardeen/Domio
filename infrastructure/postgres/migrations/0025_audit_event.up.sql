-- Migration 0025: lightweight audit log (P20.5 B2).
--
-- Append-only Postgres table backing @domio/audit-service. No hash chain,
-- no ClickHouse, no WORM bucket — that lands in full P20 WS-X2. The table
-- is intended for the 90-day default retention window; partition by month
-- if row count exceeds 50M (see R-SEC-20.5-01).
--
-- RLS policy: tenant isolation via app.tenant_id setting; bypass role for
-- the audit admin query endpoint.

BEGIN;

-- ---------------------------------------------------------------------------
-- audit_event — append-only audit log.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_event (
    id          text PRIMARY KEY,
    tenant_id   text NOT NULL,
    actor_id    text,
    actor_kind  text NOT NULL DEFAULT 'user',
    action      text NOT NULL,
    target_kind text,
    target_id   text,
    metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
    ip          text,
    user_agent  text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- Primary read index: by tenant + time, newest first.
CREATE INDEX IF NOT EXISTS audit_event_tenant_time_idx
    ON audit_event (tenant_id, created_at DESC);

-- Filter by actor within a tenant.
CREATE INDEX IF NOT EXISTS audit_event_tenant_actor_idx
    ON audit_event (tenant_id, actor_id, created_at DESC)
    WHERE actor_id IS NOT NULL;

-- Filter by action within a tenant.
CREATE INDEX IF NOT EXISTS audit_event_tenant_action_idx
    ON audit_event (tenant_id, action, created_at DESC);

-- Retention sweep — efficiently find old rows.
CREATE INDEX IF NOT EXISTS audit_event_created_idx
    ON audit_event (created_at);

-- ---------------------------------------------------------------------------
-- Row-level security (RLS) — tenant isolation.
-- ---------------------------------------------------------------------------
ALTER TABLE audit_event ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'audit_event_tenant_isolation'
    ) THEN
        CREATE POLICY audit_event_tenant_isolation ON audit_event
            USING (
                tenant_id = current_setting('app.tenant_id', true)
                OR current_setting('app.bypass_rls', true) = 'on'
            )
            WITH CHECK (
                tenant_id = current_setting('app.tenant_id', true)
                OR current_setting('app.bypass_rls', true) = 'on'
            );
    END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Append-only enforcement — DB role cannot UPDATE or DELETE.
-- The application user must be granted only INSERT and SELECT.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app') THEN
        REVOKE UPDATE, DELETE, TRUNCATE ON audit_event FROM app;
    END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- audit_retention_run — ledger of nightly retention sweeps.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_retention_run (
    id           bigserial PRIMARY KEY,
    tenant_id    text NOT NULL,
    run_at       timestamptz NOT NULL DEFAULT now(),
    rows_deleted integer NOT NULL DEFAULT 0,
    dry_run      boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS audit_retention_run_tenant_idx
    ON audit_retention_run (tenant_id, run_at DESC);

ALTER TABLE audit_retention_run ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'audit_retention_run_tenant_isolation'
    ) THEN
        CREATE POLICY audit_retention_run_tenant_isolation ON audit_retention_run
            USING (
                tenant_id = current_setting('app.tenant_id', true)
                OR current_setting('app.bypass_rls', true) = 'on'
            )
            WITH CHECK (
                tenant_id = current_setting('app.tenant_id', true)
                OR current_setting('app.bypass_rls', true) = 'on'
            );
    END IF;
END
$$;

COMMIT;