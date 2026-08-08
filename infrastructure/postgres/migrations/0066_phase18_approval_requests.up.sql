-- 0066_phase18_approval_requests.up.sql
-- Phase 18 W1: Multi-lane approval workflows with SLA policy.
--
-- Tables:
--   approval_request   — one request for approval on a deck version.
--   approval_decision  — one decision per (request, lane, approver).
--   approval_audit     — append-only audit trail of approval events.
--
-- Gates are represented in approval_request.policy JSONB (not a separate table).

BEGIN;

-- ---------------------------------------------------------------------------
-- approval_request — one request for approval on a deck version.
-- version_id: immutable snapshot/version of the deck under review.
-- policy: JSONB with lane definitions, each containing lane, role, required, sla_hours.
-- status: 'draft' | 'pending' | 'approved' | 'rejected' | 'changes_requested'
-- closed_at: set when the request reaches a terminal status.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS approval_request (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         uuid NOT NULL,
    deck_id              uuid NOT NULL,
    version_id           uuid NOT NULL,
    requested_by         uuid NOT NULL,
    requested_at         timestamptz NOT NULL DEFAULT now(),
    policy               jsonb NOT NULL DEFAULT '{"lanes":[]}'::jsonb,
    status               text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('draft','pending','approved','rejected','changes_requested')),
    closed_at            timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid NOT NULL,
    updated_by           uuid
);

CREATE INDEX IF NOT EXISTS approval_request_workspace_idx ON approval_request (workspace_id);
CREATE INDEX IF NOT EXISTS approval_request_deck_idx ON approval_request (deck_id);
CREATE INDEX IF NOT EXISTS approval_request_version_idx ON approval_request (version_id);
CREATE INDEX IF NOT EXISTS approval_request_status_idx ON approval_request (workspace_id, status);

-- ---------------------------------------------------------------------------
-- approval_decision — one decision per (request, lane, approver).
-- version_id: snapshot of the decision (immutable audit).
-- decision: 'approved' | 'rejected' | 'changes_requested'
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS approval_decision (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         uuid NOT NULL,
    request_id           uuid NOT NULL REFERENCES approval_request(id) ON DELETE CASCADE,
    lane                 text NOT NULL,
    approver_id          uuid NOT NULL,
    decision             text NOT NULL
                         CHECK (decision IN ('approved','rejected','changes_requested')),
    justification        text,
    decided_at           timestamptz NOT NULL DEFAULT now(),
    version_id           uuid NOT NULL,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid NOT NULL,
    updated_by           uuid,
    UNIQUE (request_id, lane, approver_id)
);

CREATE INDEX IF NOT EXISTS approval_decision_workspace_idx ON approval_decision (workspace_id);
CREATE INDEX IF NOT EXISTS approval_decision_request_idx ON approval_decision (request_id);
CREATE INDEX IF NOT EXISTS approval_decision_approver_idx ON approval_decision (approver_id);

-- ---------------------------------------------------------------------------
-- approval_audit — append-only audit trail of approval events.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS approval_audit (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         uuid NOT NULL,
    request_id           uuid NOT NULL,
    action               text NOT NULL,
    actor_id             uuid NOT NULL,
    detail               jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS approval_audit_workspace_idx ON approval_audit (workspace_id);
CREATE INDEX IF NOT EXISTS approval_audit_request_idx ON approval_audit (request_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'approval_request',
        'approval_decision',
        'approval_audit'
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
