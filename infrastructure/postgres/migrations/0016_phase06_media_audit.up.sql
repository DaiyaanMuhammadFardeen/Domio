-- 0016_phase06_media_audit
-- Adds the content-addressed blob store and the agent audit trail.
-- Required by the RegistryStore interface (putBlob/getBlob/hasBlob, appendAudit/listAudit).

BEGIN;

CREATE TABLE IF NOT EXISTS stored_blobs (
    sha256      text PRIMARY KEY,
    bytes       bytea NOT NULL,
    stored_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id      text NOT NULL,
    actor_kind    text NOT NULL DEFAULT 'user',
    action        text NOT NULL,
    resource_type text NOT NULL,
    resource_id   text NOT NULL,
    detail        jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_resource_idx ON audit_log (resource_type, resource_id, created_at DESC);

COMMIT;
