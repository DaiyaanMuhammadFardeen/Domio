-- Migration 0002: runtime metadata + release marker.
-- Used by the OTel SDK to emit build_sha and git_sha as resource attributes
-- and to provide a single source of truth for cross-system release
-- traceability from Phase 01 onward.

BEGIN;

CREATE TABLE IF NOT EXISTS runtime_metadata (
    k           text PRIMARY KEY,
    v           jsonb NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS release_marker (
    release_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_version  text NOT NULL,
    contract_uri      text NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now()
);

INSERT INTO runtime_metadata (k, v)
VALUES
    ('otel.resource.attributes', jsonb_build_object('deployment.environment', 'dev')),
    ('contracts.version', jsonb_build_object('value', '0.1.1'))
ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, updated_at = now();

COMMIT;
